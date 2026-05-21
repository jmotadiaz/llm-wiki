#!/usr/bin/env python3
"""
Trace Analyzer for LLM Wiki ingestion pipelines.
Usage: python analyze-trace.py <session-name> [--output json|markdown|text]

Example: python analyze-trace.py anemic-domain-model-raw78-08a043ca
"""

import json
import sys
import os
import re
import argparse
from pathlib import Path
from collections import Counter, defaultdict


# Resolve project root (script is in .agents/skills/trace-analyzer/)
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent  # .agents -> llm-wiki project root
TRACES_DIR = PROJECT_ROOT / "traces"


def load_agent_file(path: Path) -> list:
    """Load a JSON agent trace file."""
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def format_duration_ms(ms: float) -> str:
    """Format milliseconds to human-readable duration."""
    if ms < 1000:
        return f"{ms:.0f}ms"
    seconds = ms / 1000
    minutes = int(seconds // 60)
    hours = minutes // 60
    if hours > 0:
        return f"{hours}h {minutes % 60}m {int(seconds % 60)}s"
    if minutes > 0:
        return f"{minutes}m {int(seconds % 60)}s"
    return f"{seconds:.1f}s"


def calc_duration_from_timestamps(steps: list) -> float:
    """Calculate duration in ms from first to last step timestamp."""
    if not steps:
        return 0
    from datetime import datetime
    ts_list = []
    for s in steps:
        ts = s.get("timestamp", "")
        if ts:
            try:
                ts_list.append(datetime.fromisoformat(ts.replace("Z", "+00:00")))
            except ValueError:
                continue
    if len(ts_list) < 2:
        return 0
    delta = ts_list[-1] - ts_list[0]
    return delta.total_seconds() * 1000


def analyze_agent_steps(steps: list, agent_name: str) -> dict:
    """Analyze steps from a single agent trace file."""
    if not steps:
        return {
            "name": agent_name,
            "total_steps": 0,
            "tool_calls": {},
            "token_usage": {
                "total_input": 0,
                "total_output": 0,
                "total_tokens": 0,
                "total_cached": 0,
                "total_reasoning": 0,
            },
            "write_ops": [],
            "warnings": [],
            "finish_reasons": {},
            "duration_ms": 0,
            "first_ts": "",
            "last_ts": "",
            "steps_detail": [],
        }

    tool_calls = Counter()
    finish_reasons = Counter()
    total_input = 0
    total_output = 0
    total_tokens = 0
    total_cached = 0
    total_reasoning = 0
    write_ops = []
    warnings = []
    steps_detail = []

    for step in steps:
        usage = step.get("usage", {})
        total_input += usage.get("inputTokens", 0)
        total_output += usage.get("outputTokens", 0)
        total_tokens += usage.get("totalTokens", 0)
        total_cached += usage.get("cachedInputTokens", 0)
        total_reasoning += usage.get("reasoningTokens", 0)

        finish_reason = step.get("finishReason", "unknown")
        finish_reasons[finish_reason] += 1

        calls = step.get("toolCalls", [])
        for call in calls:
            tool_name = call.get("toolName", "unknown")
            tool_calls[tool_name] += 1

            if tool_name in ("add_wiki_page", "edit_wiki_page", "delete_wiki_page"):
                write_ops.append({
                    "step": step.get("stepNumber", "?"),
                    "tool": tool_name,
                    "slug": call.get("input", {}).get("slug", "?"),
                    "content_len": len(call.get("input", {}).get("content", "")),
                })

            if tool_name == "report_warning":
                warnings.append({
                    "step": step.get("stepNumber", "?"),
                    "type": call.get("input", {}).get("type", "?"),
                    "message": call.get("input", {}).get("message", "?")[:200],
                })

        # Summarize step
        num_tool_calls = len(calls)
        primary_tools = [c["toolName"] for c in calls] if calls else []
        steps_detail.append({
            "step": step.get("stepNumber", "?"),
            "ts": step.get("timestamp", ""),
            "tools": primary_tools,
            "finish_reason": finish_reason,
            "input_tokens": usage.get("inputTokens", 0),
            "output_tokens": usage.get("outputTokens", 0),
            "total_tokens": usage.get("totalTokens", 0),
            "cached": usage.get("cachedInputTokens", 0),
        })

    duration_ms = calc_duration_from_timestamps(steps)
    first_ts = steps[0].get("timestamp", "")
    last_ts = steps[-1].get("timestamp", "")

    return {
        "name": agent_name,
        "total_steps": len(steps),
        "tool_calls": dict(tool_calls),
        "token_usage": {
            "total_input": total_input,
            "total_output": total_output,
            "total_tokens": total_tokens,
            "total_cached": total_cached,
            "total_reasoning": total_reasoning,
        },
        "write_ops": write_ops,
        "warnings": warnings,
        "finish_reasons": dict(finish_reasons),
        "duration_ms": duration_ms,
        "first_ts": first_ts,
        "last_ts": last_ts,
        "steps_detail": steps_detail,
    }


def find_session(session_input: str) -> Path | None:
    """Find a trace session directory matching the user input."""
    # Direct match
    direct = TRACES_DIR / session_input
    if direct.exists() and direct.is_dir():
        return direct

    # Partial match on raw ID (e.g., "raw-78")
    if session_input.startswith("raw-"):
        for d in sorted(TRACES_DIR.iterdir()):
            if d.is_dir() and session_input.replace("raw-", "raw") in d.name:
                return d

    # Fuzzy match
    session_input_lower = session_input.lower()
    candidates = []
    for d in sorted(TRACES_DIR.iterdir()):
        if d.is_dir() and session_input_lower in d.name.lower():
            candidates.append(d)
    if len(candidates) == 1:
        return candidates[0]
    elif len(candidates) > 1:
        print(f"Multiple matches found for '{session_input}':", file=sys.stderr)
        for c in candidates[:10]:
            print(f"  - {c.name}", file=sys.stderr)
        sys.exit(1)

    return None


def discover_agents(session_dir: Path) -> list[tuple[str, Path]]:
    """Discover agent files in a trace session directory."""
    agents = []
    for f in sorted(session_dir.iterdir()):
        if f.is_file() and f.suffix == ".json":
            name = f.stem  # e.g., "planner", "aggregator", "writer-anemic-domain-model"
            agents.append((name, f))
    return agents


def detect_pipeline_type(session_name: str) -> str:
    """Detect pipeline type from session directory name."""
    if session_name.startswith("lp-"):
        return "learning-path"
    if session_name.startswith("review-"):
        return "review"
    if session_name.startswith("chat-"):
        return "chat"
    return "ingest"


def extract_plan_info(planner_steps: list) -> dict:
    """Extract plan details from the planner's final step text."""
    plan_info = {"pages_planned": 0, "inline_mentions": 0, "inbound_updates": 0, "warnings": 0}
    if not planner_steps:
        return plan_info

    # Find the final step with text (the plan JSON)
    for step in reversed(planner_steps):
        text = step.get("text", "")
        if text and step.get("finishReason") == "stop":
            try:
                # Try to extract JSON from markdown code block or raw
                clean_text = text.strip()
                # Look for ```json ... ``` block
                json_block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean_text)
                if json_block:
                    clean_text = json_block.group(1).strip()
                plan = json.loads(clean_text)
                plan_info["pages_planned"] = len(plan.get("pages", []))
                plan_info["inline_mentions"] = len(plan.get("inlineMentions") or [])
                plan_info["inbound_updates"] = len(plan.get("inboundLinkUpdates") or [])
                tlu = plan.get("tagLandscapeUpdates") or {}
                plan_info["tag_updates"] = len(tlu.get("targetSlugUpdates", []) or [])
                plan_info["warnings"] = len(plan.get("warnings") or [])
            except json.JSONDecodeError:
                pass
            break

    return plan_info


def generate_markdown_report(session_name: str, agents: list[dict], plan_info: dict) -> str:
    """Generate a markdown analysis report."""
    lines = []
    lines.append(f"# Trace Analysis Report — {session_name}")
    lines.append("")

    # Summary
    total_steps = sum(a["total_steps"] for a in agents)
    total_tokens = sum(a["token_usage"]["total_tokens"] for a in agents)
    total_warnings = sum(len(a["warnings"]) for a in agents)
    total_write_ops = sum(len(a["write_ops"]) for a in agents)
    planner_agent = next((a for a in agents if a["name"] == "planner"), None)
    writer_agents = [a for a in agents if a["name"].startswith("writer-")]
    aggregator_agent = next((a for a in agents if a["name"] == "aggregator"), None)
    reviewer_agent = next((a for a in agents if a["name"] == "reviewer"), None)
    chat_agent = next((a for a in agents if a["name"] == "chat"), None)
    pipeline = detect_pipeline_type(session_name)

    # Build summary line based on pipeline type
    if pipeline == "learning-path":
        agent_summary = f"planner + {len(writer_agents)} writers"
    elif pipeline == "review":
        agent_summary = "reviewer"
    elif pipeline == "chat":
        agent_summary = "chat agent"
    else:
        agent_summary = f"planner + {len(writer_agents)} writers + {'aggregator' if aggregator_agent else 'no aggregator'}"

    lines.append("## Summary")
    lines.append(f"- **Session**: {session_name}")
    lines.append(f"- **Pipeline**: {pipeline}")
    lines.append(f"- **Agent files**: {len(agents)} ({agent_summary})")
    lines.append(f"- **Total steps**: {total_steps}")
    lines.append(f"- **Total tokens**: {total_tokens:,}")
    if pipeline == "ingest" or pipeline == "learning-path":
        lines.append(f"- **Pages planned**: {plan_info.get('pages_planned', '?')}")
        lines.append(f"- **Write operations**: {total_write_ops}")
    elif pipeline == "review":
        replied = reviewer_agent and "reply_to_comment" in reviewer_agent["tool_calls"]
        edited = reviewer_agent and "edit_wiki_page" in reviewer_agent["tool_calls"]
        lines.append(f"- **Replied to comment**: {'yes' if replied else 'no'}")
        lines.append(f"- **Edited page**: {'yes' if edited else 'no'}")
    elif pipeline == "chat":
        pages_looked = chat_agent["tool_calls"].get("get_wiki_page", 0) if chat_agent else 0
        lines.append(f"- **Pages looked up**: {pages_looked}")
    lines.append(f"- **Warnings**: {total_warnings}")
    lines.append("")

    # Planner
    if planner_agent:
        pu = planner_agent["token_usage"]
        lines.append("## Planner")
        lines.append(f"- Steps: {planner_agent['total_steps']}")
        lines.append(f"- Duration: {format_duration_ms(planner_agent['duration_ms'])}")
        lines.append(f"- Total tokens: {pu['total_tokens']:,} (input: {pu['total_input']:,}, output: {pu['total_output']:,})")
        lines.append(f"- Cache hits: {pu['total_cached']:,} ({round(pu['total_cached']/max(pu['total_input'],1)*100, 1)}%)")
        lines.append(f"- Wiki pages read: {planner_agent['tool_calls'].get('get_wiki_page', 0)}")
        lines.append(f"- Backlinks queried: {planner_agent['tool_calls'].get('get_backlinks', 0)}")
        lines.append(f"- Pages planned: {plan_info.get('pages_planned', '?')}")
        lines.append(f"- Inline mentions: {plan_info.get('inline_mentions', 0)}")
        lines.append(f"- Inbound link updates: {plan_info.get('inbound_updates', 0)}")
        lines.append("")

    # Writers
    if writer_agents:
        lines.append("## Writers")
        lines.append("| Page | Action | Steps | Tokens | Warnings | Content |")
        lines.append("|------|--------|-------|--------|----------|---------|")
        for w in writer_agents:
            slug = w["name"].replace("writer-", "")
            action = "new" if any(op["tool"] == "add_wiki_page" for op in w["write_ops"]) else "update"
            content_len = max((op["content_len"] for op in w["write_ops"]), default=0)
            lines.append(
                f"| {slug} | {action} | {w['total_steps']} | {w['token_usage']['total_tokens']:,} | "
                f"{len(w['warnings'])} | {content_len:,} chars |"
            )
        lines.append("")

    # Aggregator
    if aggregator_agent:
        au = aggregator_agent["token_usage"]
        lines.append("## Aggregator")
        lines.append(f"- Steps: {aggregator_agent['total_steps']}")
        lines.append(f"- Duration: {format_duration_ms(aggregator_agent['duration_ms'])}")
        lines.append(f"- Total tokens: {au['total_tokens']:,}")
        lines.append(f"- Pages modified: {len(aggregator_agent['write_ops'])}")
        lines.append(f"- Warnings reported: {len(aggregator_agent['warnings'])}")
        lines.append("")

    # Reviewer
    if reviewer_agent:
        ru = reviewer_agent["token_usage"]
        lines.append("## Reviewer")
        lines.append(f"- Steps: {reviewer_agent['total_steps']}")
        lines.append(f"- Duration: {format_duration_ms(reviewer_agent['duration_ms'])}")
        lines.append(f"- Total tokens: {ru['total_tokens']:,}")
        replied = "reply_to_comment" in reviewer_agent["tool_calls"]
        edited = "edit_wiki_page" in reviewer_agent["tool_calls"]
        lines.append(f"- Replied to comment: {'yes' if replied else 'no'}")
        lines.append(f"- Edited page: {'yes' if edited else 'no'}")
        lines.append(f"- Warnings reported: {len(reviewer_agent['warnings'])}")
        lines.append("")

    # Chat
    if chat_agent:
        cu = chat_agent["token_usage"]
        lines.append("## Chat Agent")
        lines.append(f"- Steps: {chat_agent['total_steps']}")
        lines.append(f"- Duration: {format_duration_ms(chat_agent['duration_ms'])}")
        lines.append(f"- Total tokens: {cu['total_tokens']:,}")
        lines.append(f"- Pages looked up: {chat_agent['tool_calls'].get('get_wiki_page', 0)}")
        lines.append(f"- Backlinks queried: {chat_agent['tool_calls'].get('get_backlinks', 0)}")
        lines.append("")

    # Performance
    total_input = sum(a["token_usage"]["total_input"] for a in agents)
    total_output = sum(a["token_usage"]["total_output"] for a in agents)
    total_cached = sum(a["token_usage"]["total_cached"] for a in agents)
    total_reasoning = sum(a["token_usage"]["total_reasoning"] for a in agents)

    lines.append("## Performance")
    lines.append("| Metric | Value |")
    lines.append("|--------|-------|")
    lines.append(f"| Total input tokens | {total_input:,} |")
    lines.append(f"| Total output tokens | {total_output:,} |")
    lines.append(f"| Total cached tokens | {total_cached:,} |")
    cache_rate = round(total_cached / max(total_input, 1) * 100, 1)
    lines.append(f"| Cache hit rate | {cache_rate}% |")
    lines.append(f"| Total reasoning tokens | {total_reasoning:,} |")
    output_ratio = round(total_output / max(total_input, 1) * 100, 1)
    lines.append(f"| Output/Input ratio | {output_ratio}% |")
    lines.append("")

    # Tool call breakdown
    all_tools = Counter()
    for a in agents:
        for tool, count in a["tool_calls"].items():
            all_tools[tool] += count

    if all_tools:
        lines.append("## Tool Call Breakdown")
        lines.append("| Tool | Calls |")
        lines.append("|------|-------|")
        for tool, count in all_tools.most_common():
            lines.append(f"| {tool} | {count} |")
        lines.append("")

    # Warnings
    all_warnings = []
    for a in agents:
        for w in a["warnings"]:
            all_warnings.append({"agent": a["name"], **w})

    if all_warnings:
        lines.append("## Warnings")
        for w in all_warnings:
            lines.append(f"- **{w['agent']}** (step {w['step']}): [{w['type']}] {w['message']}")
        lines.append("")

    # Write operations detail
    if total_write_ops > 0:
        lines.append("## Write Operations")
        lines.append("| Agent | Tool | Slug | Content Size |")
        lines.append("|-------|------|------|-------------|")
        for a in agents:
            for op in a["write_ops"]:
                lines.append(f"| {a['name']} | {op['tool']} | {op['slug']} | {op['content_len']:,} chars |")
        lines.append("")

    # Steps detail (summary table)
    lines.append("## Steps Timeline")
    lines.append("| Agent | Step | Tools | Finish | Tokens | Cached |")
    lines.append("|-------|------|-------|--------|--------|--------|")
    for a in agents:
        for s in a["steps_detail"][:15]:
            tools_str = ", ".join(s["tools"]) if s["tools"] else "(text only)"
            lines.append(
                f"| {a['name']} | {s['step']} | {tools_str} | {s['finish_reason']} | "
                f"{s['total_tokens']:,} | {s['cached']:,} |"
            )
        if len(a["steps_detail"]) > 15:
            lines.append(f"| {a['name']} | ... | ({len(a['steps_detail']) - 15} more) | | | |")
    lines.append("")

    return "\n".join(lines)


def generate_json_report(session_name: str, agents: list[dict], plan_info: dict) -> str:
    """Generate a JSON analysis report."""
    report = {
        "session": session_name,
        "summary": {
            "agent_files": len(agents),
            "total_steps": sum(a["total_steps"] for a in agents),
            "total_tokens": sum(a["token_usage"]["total_tokens"] for a in agents),
            "pages_planned": plan_info.get("pages_planned", 0),
            "write_operations": sum(len(a["write_ops"]) for a in agents),
            "warnings": sum(len(a["warnings"]) for a in agents),
        },
        "agents": agents,
        "plan_info": plan_info,
    }
    return json.dumps(report, indent=2, default=str)


def generate_text_report(session_name: str, agents: list[dict], plan_info: dict) -> str:
    """Generate a concise text report."""
    total_steps = sum(a["total_steps"] for a in agents)
    total_tokens = sum(a["token_usage"]["total_tokens"] for a in agents)
    writer_agents = [a for a in agents if a["name"].startswith("writer-")]
    pipeline = detect_pipeline_type(session_name)

    if pipeline == "learning-path":
        agent_summary = f"planner + {len(writer_agents)} writers"
    elif pipeline == "review":
        agent_summary = "reviewer"
    elif pipeline == "chat":
        agent_summary = "chat"
    else:
        agent_summary = f"planner + {len(writer_agents)} writers + {'agg' if any(a['name']=='aggregator' for a in agents) else 'no agg'}"

    lines = [
        f"Session: {session_name}",
        f"Pipeline: {pipeline}",
        f"Agents: {len(agents)} ({agent_summary})",
        f"Steps: {total_steps}, Tokens: {total_tokens:,}",
        f"Warnings: {sum(len(a['warnings']) for a in agents)}",
    ]
    if pipeline in ("ingest", "learning-path"):
        lines.append(f"Pages planned: {plan_info.get('pages_planned', '?')}")
        lines.append(f"Write ops: {sum(len(a['write_ops']) for a in agents)}")
    for a in agents:
        u = a["token_usage"]
        dur = format_duration_ms(a["duration_ms"])
        lines.append(f"  {a['name']}: {a['total_steps']} steps, {dur}, {u['total_tokens']:,} tokens")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Analyze LLM Wiki ingestion traces")
    parser.add_argument("session", help="Trace session name or raw source ID (e.g., anemic-domain-model-raw78-08a043ca or raw-78)")
    parser.add_argument("--output", choices=["json", "markdown", "text"], default="markdown",
                        help="Output format (default: markdown)")
    parser.add_argument("--traces-dir", default=None,
                        help="Override traces directory path")
    args = parser.parse_args()

    global TRACES_DIR
    if args.traces_dir:
        TRACES_DIR = Path(args.traces_dir)

    session_dir = find_session(args.session)
    if session_dir is None:
        print(f"Error: No trace session found matching '{args.session}'", file=sys.stderr)
        if TRACES_DIR.exists():
            sessions = sorted([d.name for d in TRACES_DIR.iterdir() if d.is_dir()])
            print(f"\nAvailable sessions ({len(sessions)}):", file=sys.stderr)
            for s in sessions[-10:]:
                print(f"  - {s}", file=sys.stderr)
            if len(sessions) > 10:
                print(f"  ... and {len(sessions) - 10} more", file=sys.stderr)
        sys.exit(1)

    session_name = session_dir.name
    agents_list = discover_agents(session_dir)

    if not agents_list:
        print(f"Error: No agent files found in {session_dir}", file=sys.stderr)
        sys.exit(1)

    # Analyze each agent
    agents = []
    plan_info = {}
    for name, filepath in agents_list:
        steps = load_agent_file(filepath)
        analysis = analyze_agent_steps(steps, name)
        agents.append(analysis)

        if name == "planner":
            plan_info = extract_plan_info(steps)

    # Output
    if args.output == "json":
        print(generate_json_report(session_name, agents, plan_info))
    elif args.output == "markdown":
        print(generate_markdown_report(session_name, agents, plan_info))
    else:
        print(generate_text_report(session_name, agents, plan_info))


if __name__ == "__main__":
    main()
