// Export all types
export * from './types';

// Export adapter interfaces
export { CommunicationAdapter, BaseAdapter } from './adapters/CommunicationAdapter';

// Export services
export { ShellSessionManager } from './services/ShellSessionManager';

// Export terminal types and interfaces only (no browser dependencies)
// Browser-specific implementations should be imported from the browser build
export * from './terminal/common/terminal';

// Export utilities
export * from './utils/git-parser';
export * from './utils/shell';
export * from './utils/git';
export * from './utils/network';

// Version info
export const VERSION = '0.0.1';