'use client';
import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cpp } from '@codemirror/lang-cpp';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import type { CodeIssue } from '@/lib/workbench/compiler';
const completions = [
  ['pinMode', 'pinMode(pin, OUTPUT);'],
  ['digitalWrite', 'digitalWrite(pin, HIGH);'],
  ['digitalRead', 'digitalRead(pin)'],
  ['analogRead', 'analogRead(A0)'],
  ['analogWrite', 'analogWrite(pin, 128);'],
  ['delay', 'delay(100);'],
  ['delayMicroseconds', 'delayMicroseconds(10);'],
  ['pulseIn', 'pulseIn(pin, HIGH, 30000)'],
  ['millis', 'millis()'],
  ['Serial.begin', 'Serial.begin(115200);'],
  ['Serial.println', 'Serial.println(value);'],
  ['INPUT_PULLUP', 'INPUT_PULLUP'],
  ['OUTPUT', 'OUTPUT'],
  ['HIGH', 'HIGH'],
  ['LOW', 'LOW'],
].map(([label, apply]) => ({ label, apply, type: 'function' }));
export function SketchEditor({
  value,
  onChange,
  issues,
  jump,
}: {
  value: string;
  onChange: (s: string) => void;
  issues: CodeIssue[];
  jump: { line: number; nonce: number } | null;
}) {
  const host = useRef<HTMLDivElement>(null),
    editor = useRef<EditorView | null>(null),
    changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          cpp(),
          autocompletion({ override: [completeFromList(completions)] }),
          EditorView.contentAttributes.of({ 'aria-label': 'Arduino sketch' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changed.current(u.state.doc.toString());
          }),
          EditorView.theme({
            '&': { height: '260px', fontSize: '14px' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: 'ui-monospace, monospace',
            },
            '.cm-content': { minHeight: '240px' },
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
    // The editor owns its document; controlled external updates are applied below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const e = editor.current;
    if (e && e.state.doc.toString() !== value)
      e.dispatch({
        changes: { from: 0, to: e.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    const e = editor.current;
    if (!e) return;
    e.dispatch(
      setDiagnostics(
        e.state,
        issues
          .filter((i) => i.line <= e.state.doc.lines)
          .map((i) => {
            const l = e.state.doc.line(Math.max(1, i.line));
            return {
              from: l.from,
              to: l.to,
              severity: i.severity,
              message: i.message,
            };
          }),
      ),
    );
  }, [issues]);
  useEffect(() => {
    const e = editor.current;
    if (e && jump) {
      const l = e.state.doc.line(
        Math.min(e.state.doc.lines, Math.max(1, jump.line)),
      );
      e.dispatch({
        selection: { anchor: l.from },
        effects: EditorView.scrollIntoView(l.from, { y: 'center' }),
      });
      e.focus();
    }
  }, [jump]);
  return <div className="wb-editor" ref={host} />;
}
