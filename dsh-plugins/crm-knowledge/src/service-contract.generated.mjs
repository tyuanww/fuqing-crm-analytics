// Generated offline by scripts/crm-calibration/generate_contract.py; do not edit.
export const serviceContract = {
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
  }
};
export const sourceDigests = {
  "backend/crm_service_contracts.py": "401bedecfc901972bb6e316b3560d8c68dc5154fa6e65d70e86d1d7c1e455fa7",
  "scripts/crm-calibration/generate_contract.py": "45f0cd5d039633c9a5ee2be620bf60f161890b429873b273ff0ce06903cf1f45",
  "scripts/crm-calibration/service-client.template.mjs": "0a889285c760f918434245fe34116bd8f3385763f5e9ab904a88b8abaf1a51fc",
  "backend/contracts/crm_metrics_v1.py": "06fee24d4d7ce215d10df25a2e282f4c47834563f837d0353759fbf99b7ec6db",
  "backend/contracts/crm-metrics-service.v1.json": "85a9b4605b1ed6cc529322b6fd0df873d7d9681b3e0ffa1571d4379a376ab7e9",
  "backend/crm_metrics_app.py": "f5e87557b45999abdbedbfa0dbd35eb9ba048c6b7d777a8dd491c9b1396b0c41"
};
