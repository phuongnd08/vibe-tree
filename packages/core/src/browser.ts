// Browser-safe exports only (no Node.js dependencies)

// Export all types (types are safe for browser)
export * from './types';

// Export adapter interfaces (these are just interfaces/classes with no Node.js deps)
export { CommunicationAdapter, BaseAdapter } from './adapters/CommunicationAdapter';

// Export terminal types and interfaces only (safe for all environments)
export * from './terminal/common/terminal';

// Export browser-specific terminal implementations
export * from './terminal/browser';

// Export the IPty interface type only (no node-pty implementation)
export type { IPty } from './utils/shell';

// Version info
export const VERSION = '0.0.1';