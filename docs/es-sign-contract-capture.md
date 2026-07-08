# SIGN ES — ES-0 contract verification: FINDINGS (2026-07-08)

Verified empirically against `test.es.sign.fiskaly.com/api/v1` (managed org `8513aab6…`,
key `es-pruebas-test`). Raw request/response captures below. Closes the brief's ES-0.

1. **Merchants require a MANAGED organization.** The root org (`group1`) 401s on `PUT /taxpayer`
   ("not a managed organization"). Management API (`dashboard.fiskaly.com/api/v0`): flat auth
   `{api_key,api_secret}` → `access_token`; `POST /organizations` `{name, address_line1, zip,
   town, country_code, managed_by_organization_id}`; `POST /organizations/{id}/api-keys`
   `{name, status:'enabled'}` → `{key, secret}` (secret shown ONCE). One managed org per
   merchant/NIF = our tenant grain.
2. **Provisioning chain verified**: `PUT /taxpayer` (issuer + `SPAIN_OTHER`) → `GET /software`
   200 (fiskaly is the registered software) → `PUT /signers/{uuid}` `{}` (fiskaly-managed cert)
   → `PUT /clients/{uuid}` `{content:{signer_id}}`.
3. **Issuance**: `PUT /clients/{cid}/invoices/{iid}` (client-generated UUIDv4; we assign
   `series`+`number`; decimal STRINGS). Response: `state: ISSUED` + `compliance` block =
   45×45 PNG QR (base64), legend **`QR tributario:|VERI*FACTU`**, and the AEAT validation URL
   (`…aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=…&numserie=<series+number>&fecha=DD-MM-YYYY&importe=…`).
   **TEST hits real AEAT preproduction** (`prewww2.aeat.es`).
4. **Async AEAT verdicts**: `transmission.registration` `PENDING` at issue → final verdict by
   polling (seconds in TEST). Rejections are NOT HTTP errors: our magic-NIF issuer landed
   **`REQUIRES_INSPECTION`** with `validations[]` carrying the raw AEAT code
   (`Codigo[4116] … NIF … formato incorrecto`). The issuer fn must poll + reconcile.
5. **Idempotency (measured)**: same UUID + IDENTICAL body → 200 echo of the stored invoice;
   same UUID + different body → 409 conflict. Retry loops must replay the exact payload.
6. **Rectificativa (CORRECTING) verified**: wrapper `{type:'CORRECTING', id:<original uuid>,
   code: CORRECTION_1..4 (AJ=Bizkaia), method: SUBSTITUTION|DIFFERENCES, invoice:{nested
   SIMPLIFIED|COMPLETE}}` → 200, own compliance QR/legend, own series (`ES0TESTR`).
7. **Taxpayer is effectively immutable once resources are ENABLED** — `PATCH /taxpayer`
   with a new issuer → 409 "disable request is not allowed when there are 'ENABLED' resources".
   Get the NIF right at provisioning; a NIF change = a new managed org.
8. **Magic NIFs (T0000000x) are NOT valid as the ISSUER** at AEAT preprod (format error) —
   they're for recipient TIN validation. ⚠️ Remaining for a fully-`REGISTERED` end state:
   re-provision a fresh managed org with a format-valid NIF (or the real merchant's data).

---

# SIGN ES — captured TEST contract (ES-0)

Run: 2026-07-08T02:32:37.609Z · org `7a0289c1…` · base `https://test.es.sign.fiskaly.com/api/v1`
Final transmission state of first invoice: **not reached in polling window**

## auth — `POST /auth` → 200 (135ms)
Request:
```json
{
 "content": {
  "api_key": "<redacted>",
  "api_secret": "<redacted>"
 }
}
```
Response:
```json
{
 "content": {
  "access_token": {
   "bearer": "<redacted>",
   "expires_at": 1783564219,
   "expires_in": 86278
  },
  "claims": {
   "environment": "TEST",
   "organization_id": "8513aab6-a944-4c3f-a286-d024f783301e"
  },
  "refresh_token": {
   "bearer": "<redacted>",
   "expires_at": 1783564219,
   "expires_in": 86278
  }
 }
}
```

## taxpayer.put — `PUT /taxpayer` → 200 (254ms)
Request:
```json
{
 "content": {
  "issuer": {
   "legal_name": "EasySoft POS Pruebas SL",
   "tax_number": "T00000001"
  },
  "territory": "SPAIN_OTHER"
 }
}
```
Response:
```json
{
 "content": {
  "issuer": {
   "legal_name": "EasySoft POS Pruebas SL",
   "tax_number": "T00000001"
  },
  "state": "ENABLED",
  "territory": "SPAIN_OTHER",
  "type": "INDIVIDUAL"
 }
}
```

## software.get — `GET /software` → 200 (30ms)
_no body_
Response:
```json
{
 "content": {
  "company": {
   "legal_name": "fiskaly Iberia SL",
   "tax_number": "B44752210"
  },
  "license": "undefined",
  "name": "SIGN ES",
  "responsibility_declaration": "https://test.es.sign.fiskaly.com/api/v1/verifactu/responsibility_declaration.pdf",
  "version": "1.24.3"
 }
}
```

## signer.put — `PUT /signers/f3710f3f-8587-4c95-8002-0ca47190af6d` → 200 (48ms)
Request:
```json
{}
```
Response:
```json
{
 "content": {
  "certificate": {
   "expires_at": "01-07-2027 12:56:45",
   "serial_number": "0313EB37DF11452B6863DB0D26A61B20",
   "x509_pem": "-----BEGIN CERTIFICATE-----\nMIIItDCCB5ygAwIBAgIQAxPrN98RRStoY9sNJqYbIDANBgkqhkiG9w0BAQsFADBN\nMQswCQYDVQQGEwJFUzERMA8GA1UECgwIRk5NVC1SQ00xDjAMBgNVBAsMBUNFUkVT\nMRswGQYDVQQDDBJBQyBSZXByZXNlbnRhY2nDs24wHhcNMjUwNzAxMTI1NjQ1WhcN\nMjcwNzAxMTI1NjQ1WjCCAQcxODA2BgNVBA0ML1JlZjpBRUFUL0FFQVQwMzU2L1BV\nRVNUTyAxLzU5Mzc1LzAxMDcyMDI1MTQ1NDE2MRgwFgYDVQQFEw9JRENFUy05OTk5\nOTkxMEcxEDAOBgNVBCoMB1BSVUVCQVMxGzAZBgNVBAQMEkNFUlRJRklDQURPIEZJ\nU0lDQTE1MDMGA1UEAwwsOTk5OTk5MTBHIFBSVUVCQVMgQ0VSVElGSUNBRE8gKFI6\nIEEzOTIwMDAxOSkxGDAWBgNVBGEMD1ZBVEVTLUEzOTIwMDAxOTEkMCIGA1UECgwb\nQ0VSVElGSUNBRE8gRU5USURBRCBQUlVFQkFTMQswCQYDVQQGEwJFUzCCASIwDQYJ\nKoZIhvcNAQEBBQADggEPADCCAQoCggEBAIy6B0+zuwg4g2cWE6m9Aanv8d8QGp0t\npbcNlj3D10K45nrJPhsGAB3DuMh1tRgjJLbXt5MnbXtkgQptY1LJZU1uP+6r3lVN\nlpwn+dZjM2e41QG8Q/ywSUISoC2OjZeibwlYAVHsdCCOf6eaBiTk6YMq74y82dlp\n4nIaFu6vDDcAVmfbQjI9nWHre0/KGxj8tYItPzim3PoYSq7C1NIuOMaHe5zi+K3b\nraL+gc03HCVN61LSABuGH+Rk14UgbkL0cgsfJyTbRjpiICKW0FMF2IQXzPx2o6TJ\nO07slA2+vdQwRFveZxZtPaf5uKBvYj3tHKJ7rbR+Kl0pTqzACZd3Hx8CAwEAAaOC\nBNIwggTOMIHuBgNVHREEgeYwgeOBJHNlZ3VyaWRhZC5pbmZvcm1hdGljYUBjb3Jy\nZW8uYWVhdC5lc6SBujCBtzEeMBwGCSsGAQQBrGYBBwwPVkFURVMtQTM5MjAwMDE5\nMSowKAYJKwYBBAGsZgEGDBtDRVJUSUZJQ0FETyBFTlRJREFEIFBSVUVCQVMxHjAc\nBgkrBgEEAaxmAQQMD0lEQ0VTLTk5OTk5OTEwRzEVMBMGCSsGAQQBrGYBAwwGRklT\nSUNBMRowGAYJKwYBBAGsZgECDAtDRVJUSUZJQ0FETzEWMBQGCSsGAQQBrGYBAQwH\nUFJVRUJBUzAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIF4DAqBgNVHSUEIzAh\nBggrBgEFBQcDAgYKKwYBBAGCNwoDDAYJKoZIhvcvAQEFMIGCBggrBgEFBQcBAQR2\nMHQwPQYIKwYBBQUHMAGGMWh0dHA6Ly9vY3NwcmVwLmNlcnQuZm5tdC5lcy9vY3Nw\ncmVwL09jc3BSZXNwb25kZXIwMwYIKwYBBQUHMAKGJ2h0dHA6Ly93d3cuY2VydC5m\nbm10LmVzL2NlcnRzL0FDUkVQLmNydDAdBgNVHQ4EFgQUR6bSfJ+rYs570nxEAFCk\nOd37uNMwggE8BgNVHSAEggEzMIIBLzCCARUGCisGAQQBrGYDCwIwggEFMCkGCCsG\nAQUFBwIBFh1odHRwOi8vd3d3LmNlcnQuZm5tdC5lcy9kcGNzLzCB1wYIKwYBBQUH\nAgIwgcoMgcdDZXJ0aWZpY2FkbyBjdWFsaWZpY2FkbyBkZSByZXByZXNlbnRhbnRl\nIGRlIHAuIGp1csOtZGljYSBlbiBzdXMgcmVsYWNpb25lcyBjb24gbGFzIEFBUFAu\nIFN1amV0byBhIGNvbmRpY2lvbmVzIGRlIHVzbyBzZWfDum4gbGEgRFBDIGRlIEZO\nTVQtUkNNLCBOSUY6IFEyODI2MDA0LUogKEMvSm9yZ2UgSnVhbiAxMDYtMjgwMDkt\nTWFkcmlkLUVzcGHDsWEpMAkGBwQAi+xAAQAwCQYHYIVUAQMFCDCBpwYIKwYBBQUH\nAQMEgZowgZcwCAYGBACORgEBMBMGBgQAjkYBBjAJBgcEAI5GAQYBMGkGBgQAjkYB\nBTBfMC0WJ2h0dHBzOi8vd3d3LmNlcnQuZm5tdC5lcy9wZHMvUERTX2VzLnBkZhMC\nZXMwLhYoaHR0cHM6Ly93d3cuY2VydC5mbm10LmVzL3Bkcy9QRFNfZW4ucGRmIBMC\nZW4wCwYGBACORgEDAgEPMB8GA1UdIwQYMBaAFNxQlp/XMYnJEeTvll/2X4JSRmJT\nMIHhBgNVHR8EgdkwgdYwgdOggdCggc2GgZ1sZGFwOi8vbGRhcHJlcC5jZXJ0LmZu\nbXQuZXMvQ049Q1JMMjc3OCxPVT1BQyUyMFJlcHJlc2VudGFjaW9uLE9VPUNFUkVT\nLE89Rk5NVC1SQ00sQz1FUz9jZXJ0aWZpY2F0ZVJldm9jYXRpb25MaXN0O2JpbmFy\neT9iYXNlP29iamVjdGNsYXNzPWNSTERpc3RyaWJ1dGlvblBvaW50hitodHRwOi8v\nd3d3LmNlcnQuZm5tdC5lcy9jcmxzcmVwL0NSTDI3NzguY3JsMA0GCSqGSIb3DQEB\nCwUAA4IBAQC46T5KQd8KahbFvnBjbUrJZsbj1FQku9PXBOBQG66tM0D5ldImp6Co\nmhRHN3ZqZmQ5DGrQgk+q34t0BZJisNH4yblVDcD5gJmrYP9puhF3GLOg5bIfzWWY\ndr6EcFdruz28dVIN62s9qBLkxwsQogrRmvUX3e1jdf2EqsduMgpsZDczCNsbfII9\nbM2oI+Q/wAfYgCSGnMAXUQcyvcKyLm78O3Wt40HsYRa/K7rKDIhsJOUWrLQgE6+P\nlPdy61gK3epjJcEhisB6M30fCxUtlvMwRm74e4CDvT13iyt10jC4e6hQ80TeSpPV\n76fJby1VuayWbBvmu/7FZzYnHejmPoDZ\n-----END CERTIFICATE-----\n"
  },
  "id": "f3710f3f-8587-4c95-8002-0ca47190af6d",
  "state": "ENABLED"
 }
}
```

## client.put — `PUT /clients/976d540b-71ec-4fb7-8a66-721960efacca` → 409 (30ms)
Request:
```json
{
 "content": {
  "signer_id": "f3710f3f-8587-4c95-8002-0ca47190af6d"
 }
}
```
Response:
```json
{
 "content": {
  "code": "E_RESOURCE_CONFLICT",
  "error": "Resource Conflict",
  "message": "The requested resource has a conflict. [conflict for client '976d540b-71ec-4fb7-8a66-721960efacca' creation failed: client with id '976d540b-71ec-4fb7-8a66-721960efacca' already exists]",
  "status": 409
 }
}
```

## invoice.put — `PUT /clients/976d540b-71ec-4fb7-8a66-721960efacca/invoices/e263453a-d895-47b2-af34-9c7663882b1b` → 409 (37ms)
Request:
```json
{
 "content": {
  "type": "SIMPLIFIED",
  "series": "ES0TEST",
  "number": "2",
  "text": "Venta TPV — prueba de contrato ES-0",
  "full_amount": "12.10",
  "items": [
   {
    "text": "Producto de prueba",
    "quantity": "1.00",
    "unit_amount": "10.00",
    "full_amount": "12.10",
    "system": {
     "type": "REGULAR",
     "category": {
      "type": "VAT",
      "rate": "21.0"
     }
    }
   }
  ]
 }
}
```
Response:
```json
{
 "content": {
  "code": "E_RESOURCE_CONFLICT",
  "error": "Resource Conflict",
  "message": "The requested resource has a conflict. [invoice id 'e263453a-d895-47b2-af34-9c7663882b1b' retry with different payload is illegal: %!w(<nil>)]",
  "status": 409
 }
}
```

## invoice.retry-same-uuid — `PUT /clients/976d540b-71ec-4fb7-8a66-721960efacca/invoices/e263453a-d895-47b2-af34-9c7663882b1b` → 409 (34ms)
Request:
```json
{
 "content": {
  "type": "SIMPLIFIED",
  "series": "ES0TEST",
  "number": "2",
  "text": "Venta TPV — prueba de contrato ES-0",
  "full_amount": "12.10",
  "items": [
   {
    "text": "Producto de prueba",
    "quantity": "1.00",
    "unit_amount": "10.00",
    "full_amount": "12.10",
    "system": {
     "type": "REGULAR",
     "category": {
      "type": "VAT",
      "rate": "21.0"
     }
    }
   }
  ]
 }
}
```
Response:
```json
{
 "content": {
  "code": "E_RESOURCE_CONFLICT",
  "error": "Resource Conflict",
  "message": "The requested resource has a conflict. [invoice id 'e263453a-d895-47b2-af34-9c7663882b1b' retry with different payload is illegal: %!w(<nil>)]",
  "status": 409
 }
}
```

## invoice.correcting — `PUT /clients/976d540b-71ec-4fb7-8a66-721960efacca/invoices/d338d561-a85e-4c9f-8d0d-8a0568fa4a08` → 200 (119ms)
Request:
```json
{
 "content": {
  "type": "CORRECTING",
  "id": "e263453a-d895-47b2-af34-9c7663882b1b",
  "code": "CORRECTION_4",
  "method": "SUBSTITUTION",
  "invoice": {
   "type": "SIMPLIFIED",
   "series": "ES0TESTR",
   "number": "1",
   "text": "Rectificativa de prueba — anulación total",
   "full_amount": "0.00",
   "items": [
    {
     "text": "Producto de prueba (rectificación)",
     "quantity": "1.00",
     "unit_amount": "0.00",
     "full_amount": "0.00",
     "system": {
      "type": "REGULAR",
      "category": {
       "type": "VAT",
       "rate": "21.0"
      }
     }
    }
   ]
  }
 }
}
```
Response:
```json
{
 "content": {
  "client": {
   "id": "976d540b-71ec-4fb7-8a66-721960efacca"
  },
  "compliance": {
   "code": {
    "image": {
     "data": "iVBORw0KGgoAAAANSUhEUgAAAC0AAAAtEAAAAABP4WEFAAACdElEQVR4nJxXW5KtIAyMlvvfMrccJvYrzMel6hw1ktB5NfiUjLWqruu9vv99faWv/H3a93vsOa3VOj2eVsTUNtdm2BhM7Pc9J+de18MmeVLLGxH82rN7CXil8H5Q+4AqXGaHG6sa1VC9407TipNjvf831n7imOt4MpoZnH11GSfbNYfRJv73J6iPq5QGYvIFBcl+faa1HtfiJy5GrWJ0wBnEo2h6dW0GNqsLN9Z9jwJ4n59MiipNS7chns8+bt2HFRit5t4XK6r8jZbhfaW7VfYE/LeEcVdlPXgZtIWqe+qn6+rGYNStlovwMt1M1ujaVaAcBIdzgsJj9HJFMUHcMkWWTzxLQ1hlqQMOZhJlQ+fwlH7yCYu6x2nNOYqfoq9Ts11P783MGCTDyBFjXIzbs5N5+Ll35xLr5IkHaHov7FvlPZmbGPNedivLbyYfcIEzmb9nCZpE6//xMHiLeP9NxtcaAWWpz0XleeBM+JDiU3JyM5OqV0/UB3aZNewa7bL3JO5SC/xyV3BGFQ4vU2zB0xV7DbP3vYTG2ch+XsvRQI6NYDoj3hBpxXrpbZNKQuwLA/qV4XBYw7nPT1GZDT+s0bLOGZp5ncU5ObPkp5t8t2Ln45Licl2xBfDSEiMPx+Qun601NNqZP7FGVJN6/j6o59nEYq2xXbFHT+2cQSuhgK/VNYa5jLNxBb/8wdcYc9OfiDa/EPLELUGpwxGihu05S7ff3F6z6MWscJ7B3zoKh/r1tOqUMo7lKRctHz6TwF513A6QF37LWr/fjZPKin0HbTJ/K1aBWt+7+ALLFpm+CPzwpjV1qBCt7TOzaLw5MK39LwAA//8XhmwVTp1TEwAAAABJRU5ErkJggg==",
     "format": "image/png",
     "measurements": {
      "height": 45,
      "unit": "px",
      "width": 45
     }
    },
    "type": "QR_CODE"
   },
   "text": "QR tributario:|VERI*FACTU",
   "url": "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=T00000001&numserie=ES0TESTR1&fecha=08-07-2026&importe=0.00"
  },
  "data": "{\"id\": \"e263453a-d895-47b2-af34-9c7663882b1b\", \"code\": \"CORRECTION_4\", \"type\": \"CORRECTING\", \"method\": \"SUBSTITUTION\", \"invoice\": {\"text\": \"Rectificativa de prueba — anulación total\", \"type\": \"SIMPLIFIED\", \"items\": [{\"text\": \"Producto de prueba (rectificación)\", \"system\": {\"type\": \"REGULAR\", \"category\": {\"rate\": \"21.0\", \"type\": \"VAT\"}}, \"quantity\": \"1.00\", \"full_amount\": \"0.00\", \"unit_amount\": \"0.00\"}], \"number\": \"1\", \"series\": \"ES0TESTR\", \"full_amount\": \"0.00\"}, \"reference_original_id\": false}",
  "id": "d338d561-a85e-4c9f-8d0d-8a0568fa4a08",
  "issued_at": "08-07-2026 04:32:22",
  "signer": {
   "id": "f3710f3f-8587-4c95-8002-0ca47190af6d"
  },
  "state": "ISSUED",
  "transmission": {
   "cancellation": "NOT_CANCELLED",
   "registration": "PENDING"
  },
  "validations": []
 }
}
```

## invoice.correcting.poll — `GET /clients/976d540b-71ec-4fb7-8a66-721960efacca/invoices/d338d561-a85e-4c9f-8d0d-8a0568fa4a08` → 200 (103ms)
_no body_
Response:
```json
{
 "content": {
  "client": {
   "id": "976d540b-71ec-4fb7-8a66-721960efacca"
  },
  "compliance": {
   "code": {
    "image": {
     "data": "iVBORw0KGgoAAAANSUhEUgAAAC0AAAAtEAAAAABP4WEFAAACdElEQVR4nJxXW5KtIAyMlvvfMrccJvYrzMel6hw1ktB5NfiUjLWqruu9vv99faWv/H3a93vsOa3VOj2eVsTUNtdm2BhM7Pc9J+de18MmeVLLGxH82rN7CXil8H5Q+4AqXGaHG6sa1VC9407TipNjvf831n7imOt4MpoZnH11GSfbNYfRJv73J6iPq5QGYvIFBcl+faa1HtfiJy5GrWJ0wBnEo2h6dW0GNqsLN9Z9jwJ4n59MiipNS7chns8+bt2HFRit5t4XK6r8jZbhfaW7VfYE/LeEcVdlPXgZtIWqe+qn6+rGYNStlovwMt1M1ujaVaAcBIdzgsJj9HJFMUHcMkWWTzxLQ1hlqQMOZhJlQ+fwlH7yCYu6x2nNOYqfoq9Ts11P783MGCTDyBFjXIzbs5N5+Ll35xLr5IkHaHov7FvlPZmbGPNedivLbyYfcIEzmb9nCZpE6//xMHiLeP9NxtcaAWWpz0XleeBM+JDiU3JyM5OqV0/UB3aZNewa7bL3JO5SC/xyV3BGFQ4vU2zB0xV7DbP3vYTG2ch+XsvRQI6NYDoj3hBpxXrpbZNKQuwLA/qV4XBYw7nPT1GZDT+s0bLOGZp5ncU5ObPkp5t8t2Ln45Licl2xBfDSEiMPx+Qun601NNqZP7FGVJN6/j6o59nEYq2xXbFHT+2cQSuhgK/VNYa5jLNxBb/8wdcYc9OfiDa/EPLELUGpwxGihu05S7ff3F6z6MWscJ7B3zoKh/r1tOqUMo7lKRctHz6TwF513A6QF37LWr/fjZPKin0HbTJ/K1aBWt+7+ALLFpm+CPzwpjV1qBCt7TOzaLw5MK39LwAA//8XhmwVTp1TEwAAAABJRU5ErkJggg==",
     "format": "image/png",
     "measurements": {
      "height": 45,
      "unit": "px",
      "width": 45
     }
    },
    "type": "QR_CODE"
   },
   "text": "QR tributario:|VERI*FACTU",
   "url": "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=T00000001&numserie=ES0TESTR1&fecha=08-07-2026&importe=0.00"
  },
  "data": "{\"id\": \"e263453a-d895-47b2-af34-9c7663882b1b\", \"code\": \"CORRECTION_4\", \"type\": \"CORRECTING\", \"method\": \"SUBSTITUTION\", \"invoice\": {\"text\": \"Rectificativa de prueba — anulación total\", \"type\": \"SIMPLIFIED\", \"items\": [{\"text\": \"Producto de prueba (rectificación)\", \"system\": {\"type\": \"REGULAR\", \"category\": {\"rate\": \"21.0\", \"type\": \"VAT\"}}, \"quantity\": \"1.00\", \"full_amount\": \"0.00\", \"unit_amount\": \"0.00\"}], \"number\": \"1\", \"series\": \"ES0TESTR\", \"full_amount\": \"0.00\"}, \"reference_original_id\": false}",
  "id": "d338d561-a85e-4c9f-8d0d-8a0568fa4a08",
  "issued_at": "08-07-2026 04:32:22",
  "signer": {
   "id": "f3710f3f-8587-4c95-8002-0ca47190af6d"
  },
  "state": "ISSUED",
  "transmission": {
   "cancellation": "NOT_CANCELLED",
   "registration": "REQUIRES_INSPECTION"
  },
  "validations": [
   {
    "code": "env:Client",
    "description": "Codigo[4116].Error en la cabecera: el campo NIF del bloque ObligadoEmision tiene un formato incorrecto.. NIF:T00000001. NOMBRE_RAZON:EasySoft POS Pruebas SL"
   }
  ]
 }
}
```

## invoice.original.recheck — `GET /clients/976d540b-71ec-4fb7-8a66-721960efacca/invoices/e263453a-d895-47b2-af34-9c7663882b1b` → 200 (109ms)
_no body_
Response:
```json
{
 "content": {
  "client": {
   "id": "976d540b-71ec-4fb7-8a66-721960efacca"
  },
  "compliance": {
   "code": {
    "image": {
     "data": "iVBORw0KGgoAAAANSUhEUgAAAC0AAAAtEAAAAABP4WEFAAACdElEQVR4nJRXC47rMAjEVu5/ZT+1lMwHLL211N3UHwLMMLg7ZJyj//PpfEc91yrvwSzGw1Nr1dZ6qm/5uRn+nPTZtR6YxGKZygP8hFdhr/oKW5aQXEJa8lsa91StxXv9Fd+E9GyXV/AXh8scxzGPRz0pg+pHec8v4IjctXE4D/76ERfbxOLEwI8pFk/P6ClDxyw9p75PJ7CKD84+EQoLslqscD/rcN+p/u8w1D+D+TznkV/1GXlKE7lzirOqXM04NIqcV/KB+29cyLTnqiuJcygGspGFGwgKF+BVAwxohFnphOcDbnLmk0ZQf7cGirxzfhOmNFQ1CBA9EVb87EWYSuvsxHU99To1g1Goh2l3hHOaKco0HrGfmeHcQB0qMhQVY6rLzpHOou6McWziQCfanNl7rZ5jLWriR7T2EKaQmvt3Vll5q02vQY/GcYiUJ2jVeXXsWMfzxgyG9+qt1z4oFjWDwXLbV1Bmur5UizHtuYbM9t7DzOZusyufqbsRk9izP4hNgTztovRAH7SuovVHxcT9ZUR+rcCnvG25roU0Lc0vY/LbfZdIp9e9JfeyacR3QUKwt/kOtMCYgbifaKYh8Ab1TU8TVp8Yro3s6UTFCG/UMAgLmzep1/OtGv0cfrt8/cCcb0BzR0SiPHERXYQfvx1pSipJqnt+mem3mN/+Sej7f49ghk8I4HzUHxmTarh+3/R8LxlMLK7L09pEf6G3kf/6BdafmGa+TlhpYZ8T7VYylfG9e9Jz14xjbcxXVXMilLRlt/24iwale4/rPT91Fdxh1wW9CigK3A29YfCrUnt23evRY9wDNehyEOGkq9l/AQAA//+my24ZeuloxwAAAABJRU5ErkJggg==",
     "format": "image/png",
     "measurements": {
      "height": 45,
      "unit": "px",
      "width": 45
     }
    },
    "type": "QR_CODE"
   },
   "text": "QR tributario:|VERI*FACTU",
   "url": "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=T00000001&numserie=ES0TEST1&fecha=08-07-2026&importe=12.10"
  },
  "correction": {
   "id": "d338d561-a85e-4c9f-8d0d-8a0568fa4a08"
  },
  "data": "{\"text\": \"Venta TPV — prueba de contrato ES-0\", \"type\": \"SIMPLIFIED\", \"items\": [{\"text\": \"Producto de prueba\", \"system\": {\"type\": \"REGULAR\", \"category\": {\"rate\": \"21.0\", \"type\": \"VAT\"}}, \"quantity\": \"1.00\", \"full_amount\": \"12.10\", \"unit_amount\": \"10.00\"}], \"number\": \"1\", \"series\": \"ES0TEST\", \"full_amount\": \"12.10\"}",
  "id": "e263453a-d895-47b2-af34-9c7663882b1b",
  "issued_at": "08-07-2026 04:30:20",
  "signer": {
   "id": "f3710f3f-8587-4c95-8002-0ca47190af6d"
  },
  "state": "ISSUED",
  "transmission": {
   "cancellation": "NOT_CANCELLED",
   "registration": "REQUIRES_INSPECTION"
  },
  "validations": [
   {
    "code": "env:Client",
    "description": "Codigo[4116].Error en la cabecera: el campo NIF del bloque ObligadoEmision tiene un formato incorrecto.. NIF:T00000001. NOMBRE_RAZON:EasySoft POS Pruebas SL"
   }
  ]
 }
}
```
