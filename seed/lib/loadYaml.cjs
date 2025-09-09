const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function readYamlIfExists(relativePath) {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(absolutePath)) return null;
    const raw = fs.readFileSync(absolutePath, 'utf8');
    try {
        const data = yaml.load(raw) || {};
        return data;
    } catch (err) {
        throw new Error(`Failed to parse YAML at ${relativePath}: ${err.message}`);
    }
}

module.exports = {
    readYamlIfExists,
};


