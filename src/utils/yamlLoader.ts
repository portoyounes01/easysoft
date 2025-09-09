import { load } from 'js-yaml';

// YAML file loader for browser environment
export class YamlLoader {
  private static cache = new Map<string, any>();

  // Load YAML file from public directory
  static async loadYamlFile(filename: string): Promise<any> {
    // Check cache first
    if (this.cache.has(filename)) {
      return this.cache.get(filename);
    }

    try {
      const response = await fetch(`/seed/${filename}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`YAML file not found: ${filename}`);
          return null;
        }
        throw new Error(`Failed to load ${filename}: ${response.status} ${response.statusText}`);
      }

      const yamlText = await response.text();
      const data = load(yamlText);
      
      // Cache the result
      this.cache.set(filename, data);
      return data;
    } catch (error) {
      console.error(`Error loading YAML file ${filename}:`, error);
      throw error;
    }
  }

  // Load multiple YAML files
  static async loadMultipleYamlFiles(filenames: string[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    await Promise.all(
      filenames.map(async (filename) => {
        try {
          const data = await this.loadYamlFile(filename);
          const key = filename.replace('.yml', '').replace('.yaml', '');
          results[key] = data;
        } catch (error) {
          console.error(`Failed to load ${filename}:`, error);
          results[filename] = null;
        }
      })
    );

    return results;
  }

  // Clear cache (useful for development)
  static clearCache(): void {
    this.cache.clear();
  }
}

// Utility function for easy access
export const loadYaml = YamlLoader.loadYamlFile;
export const loadMultipleYaml = YamlLoader.loadMultipleYamlFiles;
