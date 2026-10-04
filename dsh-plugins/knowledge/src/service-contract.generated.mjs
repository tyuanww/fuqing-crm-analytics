// Generated offline by scripts/crm-calibration/generate_contract.py; do not edit.
export const serviceContract = {
  "contract": "crm-knowledge-service",
  "api_version": "1.0.0",
  "base_path": "/api/v1/crm-knowledge",
  "owner": "knowledge-service",
  "scope": "public_synthetic_pack_only",
  "compatibility": "exact_api_version",
  "operations": [
    "capabilities",
    "explain"
  ]
};
export const serviceSchemas = {
  "explainRequest": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "topic": {
        "type": "string",
        "required": true
      }
    }
  },
  "explainResponse": {
    "type": "object",
    "additionalProperties": true,
    "properties": {
      "topic": {
        "type": "string",
        "required": true
      },
      "metric_version": {
        "const": "crm-metrics/v1",
        "type": "string",
        "required": true
      },
      "pack_version": {
        "const": "crm-knowledge-offline/v1",
        "type": "string",
        "required": true
      },
      "pack_sha256": {
        "type": "string",
        "required": true
      },
      "decision_ids": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "required": true
      },
      "evidence_refs": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "required": true
      },
      "sources": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": true,
          "properties": {}
        },
        "required": true
      },
      "relations": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": true,
          "properties": {}
        },
        "required": true
      },
      "context_nodes": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": true,
          "properties": {}
        },
        "required": true
      },
      "implementation_status": {
        "type": "string",
        "required": true
      },
      "content_scope": {
        "const": "public_synthetic_pack_only",
        "type": "string",
        "required": true
      },
      "synthetic": {
        "const": true,
        "type": "boolean",
        "required": true
      },
      "publication_status": {
        "const": "local_isolated_candidate",
        "type": "string",
        "required": true
      },
      "document_acl_connected": {
        "const": false,
        "type": "boolean",
        "required": true
      },
      "code_fixed_in_legacy_services": {
        "const": false,
        "type": "boolean",
        "required": true
      },
      "execution_authorized": {
        "const": false,
        "type": "boolean",
        "required": true
      },
      "real_business_acceptance": {
        "const": false,
        "type": "boolean",
        "required": true
      },
      "dsh_using_neo4j": {
        "const": false,
        "type": "boolean",
        "required": true
      }
    }
  }
};
export const sourceDigests = {
  "backend/crm_service_contracts.py": "401bedecfc901972bb6e316b3560d8c68dc5154fa6e65d70e86d1d7c1e455fa7",
  "scripts/crm-calibration/generate_contract.py": "df890a2e596955811075978c2e8a0a9d398a52c2f1c2199650a443e5a32fefdb",
  "scripts/crm-calibration/service-client.template.mjs": "0a889285c760f918434245fe34116bd8f3385763f5e9ab904a88b8abaf1a51fc",
  "backend/contracts/crm_knowledge_v1.py": "e090e86e504a3a428e68fdd5c5b30ede12c636e8f54a3f52e71d1f6810e23c3b",
  "backend/contracts/crm-knowledge-service.v1.json": "b5fd55bbadcd115a8ecf2318347c04d5749fd86e22815df8bce07ea1dd55c7bf",
  "backend/crm_knowledge_app.py": "5b308c318e6dc75cc7079094093c1babc349b17f32ffc1221ba147ebaf2a07d9"
};
