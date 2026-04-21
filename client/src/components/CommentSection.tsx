import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Markdown from "./markdown/Markdown";

interface Comment {
  id: number;
  content: string;
  reply: string | null;
  status: "pending" | "processing" | "answered" | "failed" | "archived";
  pages_edited: string[];
  error: string | null;
  created_at: string;
  answered_at: string | null;
}

interface CommentSectionProps {
  slug: string;
}

export default function CommentSection({ slug }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Fetch comments on mount and periodically poll
  useEffect(() => {
    const fetchComments = async () => {
      try {
        const res = await fetch(`/api/wiki/${slug}/comments`);
        if (!res.ok) throw new Error("Failed to fetch comments");
        const data = await res.json();
        setComments(data.comments || []);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    };

    fetchComments();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchComments, 5000);
    return () => clearInterval(interval);
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/wiki/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: feedbackText }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit comment");
      }

      const data = await res.json();
      // Prepend new comment to the list
      setComments([data.comment, ...comments]);
      setFeedbackText("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (commentId: number) => {
    try {
      const res = await fetch(`/api/wiki/${slug}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to archive comment");
      }

      // Remove comment from list
      setComments(comments.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading comments...</p>;
  }

  return (
    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
      <h3 className="text-lg font-semibold mb-4">Feedback</h3>

      {/* Submit form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder="Leave feedback about this page..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm resize-none"
          rows={3}
        />
        <button
          type="submit"
          disabled={submitting || !feedbackText.trim()}
          className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm rounded transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Feedback"}
        </button>
        {error && (
          <p className="mt-2 text-red-600 dark:text-red-400 text-sm">{error}</p>
        )}
      </form>

      {/* Comments list */}
      {comments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No feedback yet.
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="border border-gray-200 dark:border-gray-800 rounded p-4"
            >
              {/* Feedback content */}
              <p className="text-sm mb-2">{comment.content}</p>

              {/* Status badge */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded ${
                    comment.status === "pending"
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      : comment.status === "processing"
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                        : comment.status === "answered"
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  }`}
                >
                  {comment.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(comment.created_at).toLocaleDateString()}
                </span>
              </div>

              {/* Reply */}
              {comment.reply && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded">
                  <p className="font-semibold text-xs uppercase text-gray-600 dark:text-gray-400 mb-2">
                    Reply
                  </p>
                  <div className="text-gray-700 dark:text-gray-300 dark:prose-invert max-w-none">
                    <Markdown content={comment.reply} className="prose-sm" />
                  </div>
                </div>
              )}

              {/* Error message */}
              {comment.error && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded text-sm">
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Error: {comment.error}
                  </p>
                </div>
              )}

              {/* Pages edited */}
              {comment.pages_edited && comment.pages_edited.length > 0 && (
                <div className="mt-3 text-xs">
                  <p className="font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Pages edited:
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {comment.pages_edited.map((slug: string) => (
                      <Link
                        key={slug}
                        to={`/wiki/${slug}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        [[{slug}]]
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Archive button */}
              {(comment.status === "answered" ||
                comment.status === "failed") && (
                <button
                  onClick={() => handleArchive(comment.id)}
                  className="mt-3 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline transition-colors"
                >
                  Archive
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
