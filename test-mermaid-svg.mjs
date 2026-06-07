import mermaid from 'mermaid';
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', suppressErrorRendering: true });
const { svg } = await mermaid.render('test1', 'graph TD\n    A[Hello] --> B[World]');
console.log(svg);
