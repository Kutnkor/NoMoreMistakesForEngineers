export function saveFile(
  name: string,
  value: string | Uint8Array,
  type = 'text/plain;charset=utf-8',
) {
  const blob = new Blob(
    [typeof value === 'string' ? value : new Uint8Array(value).buffer],
    { type },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
