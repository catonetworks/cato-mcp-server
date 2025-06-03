/**
 * get an environment variable by name
 * @param name the environment variable name
 * @param defaultValue optional default value if the env var is not set
 */
export function getEnvVariable(name: string, defaultValue?:string): string {
    const value = process.env[name];
    if (value) {
        return value;
    }
    if (defaultValue) {
        return defaultValue;
    }
    throw new Error(`Environment variable ${name} is not set`);
}
