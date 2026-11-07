/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/logistics_bl_nft.json`.
 */
export type LogisticsBlNft = {
  "address": "Cv8LVQWVR6t59hPQfSyf9LmFsG9ueouz5iZKfiNJV7nN",
  "metadata": {
    "name": "logisticsBlNft",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "approveDraft",
      "discriminator": [
        95,
        107,
        206,
        187,
        126,
        219,
        194,
        186
      ],
      "accounts": [
        {
          "name": "shipper",
          "signer": true,
          "relations": [
            "draft"
          ]
        },
        {
          "name": "draft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "draft.carrier",
                "account": "draft"
              },
              {
                "kind": "account",
                "path": "draft.draftId",
                "account": "draft"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelDraft",
      "discriminator": [
        234,
        193,
        92,
        79,
        29,
        206,
        188,
        175
      ],
      "accounts": [
        {
          "name": "carrier",
          "writable": true,
          "signer": true,
          "relations": [
            "draft"
          ]
        },
        {
          "name": "draft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "carrier"
              },
              {
                "kind": "account",
                "path": "draft.draftId",
                "account": "draft"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createDraft",
      "discriminator": [
        163,
        20,
        96,
        16,
        176,
        38,
        78,
        95
      ],
      "accounts": [
        {
          "name": "carrier",
          "writable": true,
          "signer": true
        },
        {
          "name": "shipper",
          "docs": [
            "approve_draft'ta kendisi verir (onay kapısının tüm amacı bu)."
          ]
        },
        {
          "name": "draft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "carrier"
              },
              {
                "kind": "arg",
                "path": "draftId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "draftId",
          "type": "u64"
        },
        {
          "name": "contentHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "issueBl",
      "discriminator": [
        30,
        10,
        40,
        125,
        78,
        160,
        231,
        121
      ],
      "accounts": [
        {
          "name": "carrier",
          "writable": true,
          "signer": true,
          "relations": [
            "draft"
          ]
        },
        {
          "name": "shipper",
          "docs": [
            "imzasına gerek yok (mimari-spec.md, çekirdek tablo #6). Kimliği `draft` üzerindeki",
            "`has_one = shipper` ile doğrulanıyor — carrier burada keyfi bir adres yazamaz,",
            "shipper'ın kendisi onayladığı taslaktaki adresle eşleşmek zorunda (onay kapısı)."
          ],
          "relations": [
            "draft"
          ]
        },
        {
          "name": "draft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "carrier"
              },
              {
                "kind": "account",
                "path": "draft.draftId",
                "account": "draft"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "shipperAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "shipper"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "blState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "processSurrender",
      "discriminator": [
        131,
        187,
        56,
        219,
        30,
        198,
        155,
        26
      ],
      "accounts": [
        {
          "name": "carrier",
          "signer": true,
          "relations": [
            "blState"
          ]
        },
        {
          "name": "blState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "docs": [
            "`address` kısıtıyla doğrulanıyor, rol/yetki kontrolü değil."
          ],
          "writable": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "surrenderRequest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  114,
                  114,
                  101,
                  110,
                  100,
                  101,
                  114,
                  95,
                  114,
                  101,
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "refundSurrenderTimeout",
      "discriminator": [
        109,
        61,
        38,
        163,
        128,
        155,
        110,
        82
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "blState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "surrenderRequest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  114,
                  114,
                  101,
                  110,
                  100,
                  101,
                  114,
                  95,
                  114,
                  101,
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "docs": [
            "`close` kısıtıyla doğrulanıyor."
          ],
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "buyerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "requestSurrender",
      "discriminator": [
        225,
        84,
        155,
        102,
        147,
        63,
        131,
        14
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "buyerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "blState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "surrenderRequest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  114,
                  114,
                  101,
                  110,
                  100,
                  101,
                  114,
                  95,
                  114,
                  101,
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "billOfLadingState",
      "discriminator": [
        159,
        118,
        163,
        109,
        11,
        237,
        86,
        0
      ]
    },
    {
      "name": "draft",
      "discriminator": [
        220,
        65,
        90,
        193,
        49,
        181,
        224,
        227
      ]
    },
    {
      "name": "surrenderRequest",
      "discriminator": [
        5,
        160,
        136,
        201,
        195,
        14,
        38,
        216
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidState",
      "msg": "Bill of lading is not in the expected state for this operation"
    },
    {
      "code": 6001,
      "name": "deadlineNotReached",
      "msg": "Surrender window deadline has not been reached yet"
    },
    {
      "code": 6002,
      "name": "draftNotApproved",
      "msg": "Draft has not been approved by the shipper yet"
    },
    {
      "code": 6003,
      "name": "draftAlreadyConsumed",
      "msg": "Draft has already been consumed by a previous issue_bl call"
    }
  ],
  "types": [
    {
      "name": "billOfLadingState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "carrier",
            "type": "pubkey"
          },
          {
            "name": "shipper",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "status"
              }
            }
          },
          {
            "name": "siRef",
            "type": "pubkey"
          },
          {
            "name": "draftRef",
            "type": "pubkey"
          },
          {
            "name": "preIssuanceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "draft",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "carrier",
            "type": "pubkey"
          },
          {
            "name": "shipper",
            "type": "pubkey"
          },
          {
            "name": "contentHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "draftId",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "draftStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "draftStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "draft"
          },
          {
            "name": "approved"
          },
          {
            "name": "consumed"
          }
        ]
      }
    },
    {
      "name": "status",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "issued"
          },
          {
            "name": "surrenderRequested"
          },
          {
            "name": "redeemed"
          }
        ]
      }
    },
    {
      "name": "surrenderRequest",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "blStateSeed",
      "type": "bytes",
      "value": "[98, 108, 95, 115, 116, 97, 116, 101]"
    },
    {
      "name": "draftSeed",
      "type": "bytes",
      "value": "[100, 114, 97, 102, 116]"
    },
    {
      "name": "surrenderRequestSeed",
      "type": "bytes",
      "value": "[115, 117, 114, 114, 101, 110, 100, 101, 114, 95, 114, 101, 113, 117, 101, 115, 116]"
    },
    {
      "name": "surrenderWindow",
      "type": "i64",
      "value": "30"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
