import React, { useEffect, useRef, useState } from 'react';
import {
  TerminalService,
  TerminalConfigurationService,
  type ITerminalService,
  type ITerminalInstance,
  type IShellLaunchConfig,
  type ITerminalConfiguration
} from '@vibetree/core';
import './VSCodeTerminal.css';

export interface VSCodeTerminalProps {
  shellLaunchConfig?: IShellLaunchConfig;
  configuration?: Partial<ITerminalConfiguration>;
  onReady?: (service: ITerminalService) => void;
  className?: string;
}

export const VSCodeTerminal: React.FC<VSCodeTerminalProps> = ({
  shellLaunchConfig,
  configuration,
  onReady,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [terminalService, setTerminalService] = useState<ITerminalService | null>(null);
  const [activeInstance, setActiveInstance] = useState<ITerminalInstance | null>(null);
  const [instances, setInstances] = useState<ITerminalInstance[]>([]);
  
  useEffect(() => {
    // Initialize terminal service
    const initializeTerminal = async () => {
      try {
        const configService = new TerminalConfigurationService(configuration);
        const service = new TerminalService(undefined, configService);
        setTerminalService(service);
      
        service.onDidCreateInstance((instance: ITerminalInstance) => {
          setInstances(prev => [...prev, instance]);
        });
        
        service.onDidDisposeInstance((instance: ITerminalInstance) => {
          setInstances(prev => prev.filter(i => i.id !== instance.id));
        });
        
        service.onDidChangeActiveInstance((instance: ITerminalInstance | undefined) => {
          setActiveInstance(instance || null);
        });
        
        const instance = await service.createTerminal(shellLaunchConfig);
        if (containerRef.current) {
          await instance.attachToElement(containerRef.current);
        }
        
        if (onReady) {
          onReady(service);
        }
      } catch (error) {
        console.error('Failed to initialize terminal service:', error);
      }
    };
    
    initializeTerminal();
    
    return () => {
      terminalService?.dispose();
    };
  }, []);
  
  const handleCreateTerminal = async () => {
    if (!terminalService) return;
    
    const instance = await terminalService.createTerminal({
      name: `Terminal ${instances.length + 1}`
    });
    
    if (containerRef.current) {
      const terminalContainer = document.createElement('div');
      terminalContainer.className = 'terminal-instance';
      terminalContainer.style.display = activeInstance?.id === instance.id ? 'block' : 'none';
      containerRef.current.appendChild(terminalContainer);
      instance.attachToElement(terminalContainer);
    }
  };
  
  const handleSplitTerminal = async () => {
    if (!terminalService || !activeInstance) return;
    
    const newInstance = await terminalService.splitInstance(activeInstance);
    if (newInstance && containerRef.current) {
      const terminalContainer = document.createElement('div');
      terminalContainer.className = 'terminal-instance split';
      containerRef.current.appendChild(terminalContainer);
      newInstance.attachToElement(terminalContainer);
    }
  };
  
  const handleCloseTerminal = () => {
    if (!activeInstance) return;
    activeInstance.dispose();
  };
  
  const handleSelectInstance = (instance: ITerminalInstance) => {
    if (!terminalService) return;
    
    terminalService.setActiveInstance(instance);
    instance.focus();
    
    if (containerRef.current) {
      const containers = containerRef.current.querySelectorAll('.terminal-instance');
      containers.forEach((container, index) => {
        const htmlContainer = container as HTMLElement;
        htmlContainer.style.display = instances[index]?.id === instance.id ? 'block' : 'none';
      });
    }
  };
  
  return (
    <div className={`vscode-terminal-container ${className}`}>
      <div className="terminal-header">
        <div className="terminal-tabs">
          {instances.map((instance) => (
            <div
              key={instance.id}
              className={`terminal-tab ${activeInstance?.id === instance.id ? 'active' : ''}`}
              onClick={() => handleSelectInstance(instance)}
            >
              <span className="terminal-tab-title">{instance.title}</span>
              <button
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  instance.dispose();
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="terminal-actions">
          <button
            className="terminal-action"
            onClick={handleCreateTerminal}
            title="New Terminal"
          >
            +
          </button>
          <button
            className="terminal-action"
            onClick={handleSplitTerminal}
            disabled={!activeInstance}
            title="Split Terminal"
          >
            ⊞
          </button>
          <button
            className="terminal-action"
            onClick={handleCloseTerminal}
            disabled={!activeInstance}
            title="Kill Terminal"
          >
            🗑
          </button>
        </div>
      </div>
      <div className="terminal-body" ref={containerRef} />
    </div>
  );
};

export default VSCodeTerminal;