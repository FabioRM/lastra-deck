# Test fixtures

`service-deadlines-key.pem` and `service-deadlines-cert.pem` are a throwaway self-signed key pair used only by `test/service-deadlines.test.js` to serve TLS on 127.0.0.1. They protect nothing and are not secrets; secret scanners may still flag the private key.
