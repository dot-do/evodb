/**
 * Plugin Error Classes
 *
 * TDD Issue: evodb-w1m
 *
 * Error types for the plugin system:
 * - PluginError: Base error class
 * - PluginRegistrationError: Registration failures
 * - PluginNotFoundError: Plugin lookup failures
 * - PluginValidationError: Invalid plugin structure
 */

/**
 * Base error class for all plugin-related errors.
 */
export class PluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PluginError.prototype);
  }
}

/**
 * Error thrown when plugin registration fails.
 * Common causes:
 * - Duplicate plugin name
 * - Duplicate typeId for encodings
 * - Duplicate indexType for indexes
 * - Duplicate adapterType for storage adapters
 */
export class PluginRegistrationError extends PluginError {
  /** Name of the plugin that failed to register */
  public readonly pluginName: string;

  constructor(pluginName: string, message: string) {
    super(`Failed to register plugin '${pluginName}': ${message}`);
    this.name = 'PluginRegistrationError';
    this.pluginName = pluginName;
    Object.setPrototypeOf(this, PluginRegistrationError.prototype);
  }
}

/**
 * Error thrown when a requested plugin is not found.
 */
export class PluginNotFoundError extends PluginError {
  /** Name of the plugin that was not found */
  public readonly pluginName: string;
  /** Type of plugin that was being looked up */
  public readonly pluginType: string;

  constructor(pluginName: string, pluginType: string) {
    super(`Plugin '${pluginName}' of type '${pluginType}' not found`);
    this.name = 'PluginNotFoundError';
    this.pluginName = pluginName;
    this.pluginType = pluginType;
    Object.setPrototypeOf(this, PluginNotFoundError.prototype);
  }
}

/**
 * Error thrown when a plugin fails validation.
 * Contains details about what validation check failed.
 */
export class PluginValidationError extends PluginError {
  /** Name of the plugin that failed validation */
  public readonly pluginName: string;
  /** Additional details about the validation failure */
  public readonly details?: Record<string, unknown>;

  constructor(pluginName: string, message: string, details?: Record<string, unknown>) {
    super(`Plugin '${pluginName}' validation failed: ${message}`);
    this.name = 'PluginValidationError';
    this.pluginName = pluginName;
    this.details = details;
    Object.setPrototypeOf(this, PluginValidationError.prototype);
  }
}
