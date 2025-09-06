// Export all types
export * from './types';

// Export adapter interfaces
export { CommunicationAdapter, BaseAdapter } from './adapters/CommunicationAdapter';

// Export services
export { ShellSessionManager } from './services/ShellSessionManager';

// Export terminal architecture
export * from './terminal';

// Export utilities
export * from './utils/git-parser';
export * from './utils/shell';
export * from './utils/git';
export * from './utils/network';

// Version info
export const VERSION = '0.0.1';