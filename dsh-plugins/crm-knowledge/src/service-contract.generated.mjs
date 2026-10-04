// Generated offline by scripts/crm-calibration/generate_contract.py; do not edit.
export const serviceContracts = {
  "metrics": {
    "contract": "crm-metrics-service",
    "api_version": "1.0.0",
    "base_path": "/api/v1/crm-metrics",
    "owner": "crm-service",
    "scope": "synthetic_only",
    "compatibility": "exact_api_version",
    "operations": [
      "capabilities",
      "query"
    ]
  },
  "knowledge": {
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
  }
};
export const serviceSchemas = {
  "queryRequest": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "source_id": {
        "type": "string",
        "required": true,
        "const": "synthetic-crm-metrics"
      },
      "contains_real_data": {
        "type": "boolean",
        "required": true,
        "const": false
      },
      "metric_version": {
        "const": "crm-metrics/v1",
        "type": "string",
        "required": true
      },
      "query_id": {
        "enum": [
          "sales_window_summary",
          "existing_customer_repurchase",
          "sample_followup"
        ],
        "type": "string",
        "required": true
      },
      "period_start": {
        "type": "string",
        "required": true
      },
      "period_end_exclusive": {
        "type": "string",
        "required": true
      },
      "refund_view": {
        "enum": [
          "ORDER_COHORT_AS_OF",
          "REFUND_FLOW"
        ],
        "type": "string",
        "required": true
      },
      "refund_as_of": {
        "type": "string",
        "required": true
      },
      "data_through": {
        "type": "string",
        "required": true
      },
      "timezone": {
        "const": "Asia/Shanghai",
        "type": "string"
      },
      "channel_ids": {
        "oneOf": [
          {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          {
            "type": "null"
          }
        ]
      },
      "product_ids": {
        "oneOf": [
          {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          {
            "type": "null"
          }
        ]
      },
      "identity_scope": {
        "const": "STOREWIDE",
        "type": "string"
      },
      "observation_days": {
        "oneOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ]
      },
      "amount_already_net": {
        "type": "boolean"
      },
      "cohort_period_start": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "cohort_period_end_exclusive": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "actor_scope": {
        "type": "string"
      }
    }
  },
  "queryResponse": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "status": {
        "enum": [
          "OK",
          "UNAVAILABLE"
        ],
        "type": "string",
        "required": true
      },
      "schema_version": {
        "const": "crm-metrics-wire/v1",
        "type": "string"
      },
      "query_version": {
        "const": "crm-metrics-query/v1",
        "type": "string"
      },
      "source_id": {
        "type": "string",
        "required": true
      },
      "contains_real_data": {
        "type": "boolean",
        "required": true
      },
      "synthetic": {
        "type": "boolean",
        "required": true
      },
      "metric_version": {
        "const": "crm-metrics/v1",
        "type": "string",
        "required": true
      },
      "query_id": {
        "type": "string",
        "required": true
      },
      "metric_id": {
        "type": "string",
        "required": true
      },
      "data_version": {
        "type": "string",
        "required": true
      },
      "mapping_version": {
        "type": "string",
        "required": true
      },
      "data_through": {
        "type": "string",
        "required": true
      },
      "resolved_filters": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "period_start": {
            "type": "string",
            "required": true
          },
          "period_end_exclusive": {
            "type": "string",
            "required": true
          },
          "refund_view": {
            "type": "string",
            "required": true
          },
          "refund_as_of": {
            "type": "string",
            "required": true
          },
          "data_through": {
            "type": "string",
            "required": true
          },
          "timezone": {
            "type": "string",
            "required": true
          },
          "channel_ids": {
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ],
            "required": true
          },
          "product_ids": {
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ],
            "required": true
          },
          "identity_scope": {
            "type": "string",
            "required": true
          },
          "observation_days": {
            "oneOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "amount_already_net": {
            "type": "boolean",
            "required": true
          },
          "cohort_period_start": {
            "oneOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "cohort_period_end_exclusive": {
            "oneOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "yoy_period_start": {
            "oneOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "yoy_period_end_exclusive": {
            "oneOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": true
      },
      "facts": {
        "type": "object",
        "additionalProperties": true,
        "properties": {},
        "required": true
      },
      "limitations": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "code": {
              "type": "string",
              "required": true
            },
            "message": {
              "type": "string",
              "required": true
            },
            "related_fact": {
              "oneOf": [
                {
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            }
          }
        },
        "required": true
      },
      "query_ref": {
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
      "implementation_status": {
        "enum": [
          "synthetic_verified",
          "not_implemented",
          "source_unverified"
        ],
        "type": "string",
        "required": true
      },
      "publication_status": {
        "const": "local_isolated_candidate",
        "type": "string"
      },
      "real_business_acceptance": {
        "type": "boolean"
      },
      "production_release": {
        "type": "boolean"
      },
      "adapter_query_ref": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "adapter_version": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "permission_version": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "actor_scope": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "source_data_through": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "coverage_start": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "history_complete": {
        "oneOf": [
          {
            "type": "boolean"
          },
          {
            "type": "null"
          }
        ]
      }
    }
  },
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
  "backend/contracts/crm_metrics_v1.py": "06fee24d4d7ce215d10df25a2e282f4c47834563f837d0353759fbf99b7ec6db",
  "backend/contracts/crm_knowledge_v1.py": "e090e86e504a3a428e68fdd5c5b30ede12c636e8f54a3f52e71d1f6810e23c3b",
  "backend/contracts/crm-metrics-service.v1.json": "85a9b4605b1ed6cc529322b6fd0df873d7d9681b3e0ffa1571d4379a376ab7e9",
  "backend/contracts/crm-knowledge-service.v1.json": "b5fd55bbadcd115a8ecf2318347c04d5749fd86e22815df8bce07ea1dd55c7bf",
  "backend/crm_service_contracts.py": "401bedecfc901972bb6e316b3560d8c68dc5154fa6e65d70e86d1d7c1e455fa7",
  "backend/crm_metrics_app.py": "f5e87557b45999abdbedbfa0dbd35eb9ba048c6b7d777a8dd491c9b1396b0c41",
  "backend/crm_knowledge_app.py": "5b308c318e6dc75cc7079094093c1babc349b17f32ffc1221ba147ebaf2a07d9",
  "scripts/crm-calibration/generate_contract.py": "8efce1fc3f663e9106f5dab712d3b0aef22dd81324e9d69be11a3915ed59d939"
};
