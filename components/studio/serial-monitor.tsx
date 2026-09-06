'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Cable, Download, Unplug } from 'lucide-react';
type Port = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};
type SerialAPI = { requestPort: () => Promise<Port> };
const subscribeAvailability = () => () => {};
const getAvailability = () => 'serial' in navigator;
const getServerAvailability = () => false;
export function SerialMonitor() {
  const available = useSyncExternalStore(
    subscribeAvailability,
    getAvailability,
    getServerAvailability,
  );
  const [status, setStatus] = useState('Disconnected'),
    [lines, setLines] = useState<string[]>([]),
    [active, setActive] = useState(false),
    [busy, setBusy] = useState(false);
  const port = useRef<Port | null>(null),
    reader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null),
    running = useRef(false),
    mounted = useRef(true);
  async function disconnect() {
    running.current = false;
    try {
      await reader.current?.cancel();
    } catch {}
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void disconnect();
    };
  }, []);
  async function connect() {
    setBusy(true);
    setStatus('Selecting a port…');
    try {
      const api = (navigator as Navigator & { serial: SerialAPI }).serial;
      const p = await api.requestPort();
      port.current = p;
      await p.open({ baudRate: 115200 });
      if (!mounted.current) {
        await p.close();
        return;
      }
      if (!p.readable) throw new Error('The port is not readable.');
      running.current = true;
      setActive(true);
      setBusy(false);
      setStatus('115200 baud · live data');
      const r = p.readable.getReader();
      reader.current = r;
      const decoder = new TextDecoder();
      let pending = '';
      try {
        while (running.current) {
          const { value, done } = await r.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          if (pending.length > 16384) pending = pending.slice(-16384);
          const incoming = pending.split('\n');
          pending = incoming.pop() ?? '';
          if (incoming.length && mounted.current)
            setLines((prev) =>
              [...prev, ...incoming.map((x) => x.replace(/\r$/, ''))].slice(
                -200,
              ),
            );
        }
      } finally {
        r.releaseLock();
        reader.current = null;
        await p.close();
        port.current = null;
      }
      if (mounted.current) setStatus('Connection closed');
    } catch (e) {
      if (mounted.current)
        setStatus(e instanceof Error ? e.message : 'Could not open connection');
    } finally {
      running.current = false;
      if (mounted.current) {
        setActive(false);
        setBusy(false);
      }
    }
  }
  function save() {
    const url = URL.createObjectURL(
      new Blob([lines.join('\n')], { type: 'text/plain' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuit-forge-serial.jsonl';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="serial-pane">
      <div className="serial-toolbar">
        <span className={active ? 'live-label' : ''}>
          <i />
          {status}
        </span>
        <div className="action-row">
          <Button
            size="sm"
            variant="outline"
            disabled={!lines.length}
            onClick={save}
          >
            <Download size={14} />
            Download log
          </Button>
          <Button
            size="sm"
            disabled={!available || busy}
            onClick={() => void (active ? disconnect() : connect())}
          >
            {active ? <Unplug size={14} /> : <Cable size={14} />}{' '}
            {active ? 'Disconnect' : 'Connect to Arduino'}
          </Button>
        </div>
      </div>
      <pre className="serial-log" aria-live="off">
        {lines.length
          ? lines.join('\n')
          : '> Live Arduino data will appear here.\n> Upload the sketch with Arduino IDE.\n> Close the IDE serial monitor, then select the port.\n> Baud: 115200 · One JSON object per line'}
      </pre>
      <p className="micro-copy">
        {available
          ? 'Only the serial port you select is read; this page keeps the latest 200 lines.'
          : 'This browser does not support Web Serial. Use desktop Chrome/Edge or the Arduino IDE serial monitor.'}{' '}
        This view does not upload code.
      </p>
    </div>
  );
}
