export type CodeIssue = {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
};
export function compilerIssues(output: string): CodeIssue[] {
  const out: CodeIssue[] = [];
  for (const line of output.split('\n')) {
    const m =
      /[^\s:]+\.(?:ino|cpp):(\d+)(?::(\d+))?:\s*(error|warning):\s*(.*)/.exec(
        line,
      );
    if (m)
      out.push({
        line: Number(m[1]),
        column: Number(m[2] ?? 1),
        severity: m[3] as 'error' | 'warning',
        message: m[4],
      });
  }
  return out.slice(0, 30);
}
export function explainCompilerIssue(message: string) {
  if (message.includes('not declared'))
    return 'Check the spelling and declare the variable or function before using it.';
  if (message.includes('expected'))
    return 'Check punctuation and matching brackets near this line and the line above.';
  if (message.includes('No such file'))
    return 'The requested library is unavailable. Use a built-in library or compile in Arduino IDE and load HEX.';
  return 'Review the highlighted line and the compiler message.';
}
