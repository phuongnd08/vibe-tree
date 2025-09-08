import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';

interface UseTerminalOptions {
  options?: any;
  addons?: any[];
  listeners?: {
    onBinary?: (data: string) => void;
    onCursorMove?: () => void;
    onLineFeed?: () => void;
    onScroll?: (newPosition: number) => void;
    onSelectionChange?: () => void;
    onRender?: (e: { start: number; end: number }) => void;
    onResize?: (e: { cols: number; rows: number }) => void;
    onTitleChange?: (newTitle: string) => void;
    onKey?: (e: { key: string; domEvent: KeyboardEvent }) => void;
    onData?: (data: string) => void;
    customKeyEventHandler?: (event: KeyboardEvent) => boolean;
  };
}

export function useTerminal({ options, addons, listeners }: UseTerminalOptions = {}) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const listenersRef = useRef(listeners);
  const [terminalInstance, setTerminalInstance] = useState<Terminal | null>(null);

  // Keep the latest version of listeners without retriggering the effect
  useEffect(() => {
    listenersRef.current = listeners;
  }, [listeners]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal with all options properly set at initialization
    const terminalOptions = {
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: false,
      convertEol: true,
      scrollback: 10000,
      tabStopWidth: 4,
      windowsMode: false,
      allowProposedApi: true,
      macOptionIsMeta: true,
      ...options, // Allow overriding defaults
    };
    
    console.log('Creating terminal with macOptionIsMeta:', terminalOptions.macOptionIsMeta);
    const instance = new Terminal(terminalOptions);

    // Load optional addons
    addons?.forEach((addon) => instance.loadAddon(addon));

    // Register event listeners from the ref
    const l = listenersRef.current;
    l?.onBinary && instance.onBinary(l.onBinary);
    l?.onCursorMove && instance.onCursorMove(l.onCursorMove);
    l?.onLineFeed && instance.onLineFeed(l.onLineFeed);
    l?.onScroll && instance.onScroll(l.onScroll);
    l?.onSelectionChange && instance.onSelectionChange(l.onSelectionChange);
    l?.onRender && instance.onRender(l.onRender);
    l?.onResize && instance.onResize(l.onResize);
    l?.onTitleChange && instance.onTitleChange(l.onTitleChange);
    l?.onKey && instance.onKey(l.onKey);
    l?.onData && instance.onData(l.onData);
    l?.customKeyEventHandler && instance.attachCustomKeyEventHandler(l.customKeyEventHandler);

    // Open terminal in the DOM element
    instance.open(terminalRef.current);
    instance.focus();
    
    // Verify macOptionIsMeta is set
    console.log('Terminal options after creation:', instance.options);
    console.log('macOptionIsMeta value:', instance.options.macOptionIsMeta);

    setTerminalInstance(instance);

    return () => {
      instance.dispose();
      setTerminalInstance(null);
    };
  }, [options, addons]);

  return {
    ref: terminalRef,
    instance: terminalInstance,
  };
}