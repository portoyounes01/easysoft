const crypto = require('crypto');

// EXEMPLO: para testes locais, geramos um par de chaves RSA
// Em produção, usas as tuas chaves PEM reais
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

function gerarHashDocumento({
  invoiceDate,
  systemEntryDate,
  invoiceNo,
  grossTotal,
  prevHash = '',
  hashControl = '1'
}) {
  const stringParaAssinar = [
    invoiceDate,
    systemEntryDate,
    invoiceNo,
    Number(grossTotal).toFixed(2),
    prevHash
  ].join(';');

  const signer = crypto.createSign('RSA-SHA1');
  signer.update(stringParaAssinar, 'utf8');
  signer.end();

  const hash = signer.sign(privateKey, 'base64');

  return {
    hash,
    hashControl,
    stringParaAssinar,
    hashImpresso: `${hash[0]}-${hash[10]}-${hash[20]}-${hash[30]}`
  };
}

// =========================
// TESTE 1: primeiro doc
// =========================
const doc1 = gerarHashDocumento({
  invoiceDate: '2026-03-30',
  systemEntryDate: '2026-03-30T14:00:00',
  invoiceNo: 'FS CDVF/0001',
  grossTotal: 100.00,
  prevHash: '',
  hashControl: '1'
});

console.log('DOC 1');
console.log(doc1);

// =========================
// TESTE 2: segundo doc da mesma série
// usa o hash do doc anterior
// =========================
const doc2 = gerarHashDocumento({
  invoiceDate: '2026-03-30',
  systemEntryDate: '2026-03-30T14:05:22',
  invoiceNo: 'FS CDVF/0002',
  grossTotal: 250.50,
  prevHash: doc1.hash,
  hashControl: '1'
});

console.log('DOC 2');
console.log(doc2);

// =========================
// VALIDAÇÃO COM CHAVE PÚBLICA
// simula o que a AT faz
// =========================
function validarHash({ stringParaAssinar, hash }) {
  const verifier = crypto.createVerify('RSA-SHA1');
  verifier.update(stringParaAssinar, 'utf8');
  verifier.end();

  return verifier.verify(publicKey, hash, 'base64');
}

console.log('DOC1 válido?', validarHash(doc1));
console.log('DOC2 válido?', validarHash(doc2));