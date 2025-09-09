const crypto = require('crypto');

function coerceToUuidOrDeterministic(value) {
    if (!value) return crypto.randomUUID();
    const str = String(value);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(str)) return str;
    // Deterministic v4-like from sha1
    const hash = crypto.createHash('sha1').update(str).digest('hex');
    return [
        hash.substring(0, 8),
        hash.substring(8, 12),
        '4' + hash.substring(13, 16),
        (parseInt(hash.substring(16, 18), 16) & 0x3f | 0x80).toString(16) + hash.substring(18, 20) + hash.substring(20, 22),
        hash.substring(22, 34)
    ].join('-');
}

module.exports = { coerceToUuidOrDeterministic };


