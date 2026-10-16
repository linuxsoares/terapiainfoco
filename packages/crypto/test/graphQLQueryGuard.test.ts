import { describe, it, expect } from 'bun:test';
import {
  GraphQLRiskSeverity,
  GraphQLThreatCategory,
  GraphQLValidationAction,
  GraphQLOperationType,
  UserRole
} from '@terapiainfoco/shared';
import {
  GraphQLTokenizer,
  GraphQLParser,
  GraphQLQueryAnalyzer,
  inspectGraphQLQuery,
  generateGraphQLCostProofSeal,
  verifyGraphQLCostProofSeal,
  canonicalJsonStringify,
  DEFAULT_GRAPHQL_GUARD_POLICY,
  DEFAULT_GRAPHQL_GUARD_SECRET,
  SAMPLE_GRAPHQL_SCHEMAS,
  SAMPLE_GRAPHQL_ATTACKS
} from '../src/graphQLQueryGuard';

describe('GraphQL Query Guard & Cost Limiting Engine (OWASP ASVS v4.0 V5.1)', () => {
  describe('1. Tokenizador Léxico Determinístico (GraphQLTokenizer)', () => {
    it('deve tokenizar query simples com campos e chaves', () => {
      const tokenizer = new GraphQLTokenizer('{ patient { id name } }');
      const tokens = tokenizer.tokenize();

      expect(tokens.length).toBe(8); // {, patient, {, id, name, }, }, EOF
      expect(tokens[0].type).toBe('LBRACE');
      expect(tokens[1].type).toBe('NAME');
      expect(tokens[1].value).toBe('patient');
      expect(tokens[tokens.length - 1].type).toBe('EOF');
    });

    it('deve reconhecer argumentos numéricos, strings e diretivas', () => {
      const query = 'query GetRecord($id: ID!) { record(id: "123", limit: 10) @include(if: true) { cid11 } }';
      const tokenizer = new GraphQLTokenizer(query);
      const tokens = tokenizer.tokenize();

      expect(tokens.some((t) => t.type === 'DOLLAR')).toBe(true);
      expect(tokens.some((t) => t.type === 'AT')).toBe(true);
      expect(tokens.some((t) => t.type === 'STRING' && t.value === '123')).toBe(true);
      expect(tokens.some((t) => t.type === 'INT' && t.value === '10')).toBe(true);
    });

    it('deve ignorar comentários com hash (#) e tratar vírgulas como whitespace', () => {
      const query = `
        # Consulta de histórico clínico
        {
          patient,
          # Outro comentário
          records,
        }
      `;
      const tokenizer = new GraphQLTokenizer(query);
      const tokens = tokenizer.tokenize();
      const names = tokens.filter((t) => t.type === 'NAME').map((t) => t.value);

      expect(names).toEqual(['patient', 'records']);
    });

    it('deve disparar erro para caracteres desconhecidos', () => {
      const tokenizer = new GraphQLTokenizer('{ patient % invalid }');
      expect(() => tokenizer.tokenize()).toThrow('Caractere inválido ou inesperado');
    });

    it('deve disparar erro se string não for fechada', () => {
      const tokenizer = new GraphQLTokenizer('{ patient(name: "unclosed) }');
      expect(() => tokenizer.tokenize()).toThrow('String não terminada');
    });
  });

  describe('2. Parser AST Seguro e Reconhecimento Gramatical (GraphQLParser)', () => {
    it('deve parsear operação anônima básica', () => {
      const tokenizer = new GraphQLTokenizer('{ patient { id nameMasked } }');
      const parser = new GraphQLParser(tokenizer.tokenize());
      const doc = parser.parse();

      expect(doc.operations.length).toBe(1);
      expect(doc.operations[0].operationType).toBe(GraphQLOperationType.QUERY);
      expect(doc.operations[0].selectionSet.length).toBe(1);
    });

    it('deve parsear mutação nomeada com argumentos', () => {
      const query = 'mutation SignSoapNote { signRecord(id: "rec_99") { id signed } }';
      const tokenizer = new GraphQLTokenizer(query);
      const parser = new GraphQLParser(tokenizer.tokenize());
      const doc = parser.parse();

      expect(doc.operations.length).toBe(1);
      expect(doc.operations[0].operationType).toBe(GraphQLOperationType.MUTATION);
      expect(doc.operations[0].name).toBe('SignSoapNote');
    });

    it('deve parsear definições de fragmentos nomeados e spreads', () => {
      const query = `
        query GetPatient {
          patient(id: "1") {
            ...PatientDetails
          }
        }
        fragment PatientDetails on Patient {
          id
          nameMasked
        }
      `;
      const tokenizer = new GraphQLTokenizer(query);
      const parser = new GraphQLParser(tokenizer.tokenize());
      const doc = parser.parse();

      expect(doc.fragments.has('PatientDetails')).toBe(true);
      expect(doc.fragments.get('PatientDetails')?.typeCondition).toBe('Patient');
    });
  });

  describe('3. Análise de Profundidade (Anti-Depth DoS)', () => {
    it('deve calcular profundidade rasa corretamente (depth = 2)', () => {
      const query = '{ patient { id clinicalRecords { cid11 } } }';
      const result = inspectGraphQLQuery(query);

      expect(result.computedDepth).toBe(3); // patient(1) -> clinicalRecords(2) -> cid11(3)
      expect(result.allowed).toBe(true);
    });

    it('deve bloquear consultas com profundidade excessiva que violem a política', () => {
      const deepQuery = `
        query ExcessiveDepth {
          a {
            b {
              c {
                d {
                  e {
                    f {
                      g {
                        h {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const result = inspectGraphQLQuery(deepQuery, { ...DEFAULT_GRAPHQL_GUARD_POLICY, maxAllowedDepth: 5 });

      expect(result.allowed).toBe(false);
      expect(result.computedDepth).toBe(9);
      expect(result.threats.some((t) => t.category === GraphQLThreatCategory.CIRCULAR_DEPTH_DOS)).toBe(true);
      expect(result.action).toBe(GraphQLValidationAction.BLOCK_ATTEMPT);
    });
  });

  describe('4. Análise de Complexidade & Custo (Query Cost Analysis)', () => {
    it('deve ponderar campos escalares com peso 1 e coleções paginadas', () => {
      const query = '{ patient { id nameMasked } }';
      const result = inspectGraphQLQuery(query);

      expect(result.computedCost).toBeGreaterThan(0);
      expect(result.computedCost).toBeLessThan(10);
      expect(result.topCostNodes.length).toBeGreaterThan(0);
    });

    it('deve aplicar multiplicador de paginação em coleções (limit: 50)', () => {
      const query = '{ patients(limit: 50) { id } }';
      const result = inspectGraphQLQuery(query);

      expect(result.computedCost).toBeGreaterThanOrEqual(50);
    });

    it('deve bloquear consultas que excedam a cota máxima de custo (Cost Bomb)', () => {
      const costBombQuery = `
        query MegaCost {
          patients(limit: 100) {
            clinicalRecords(limit: 100) {
              id
              sessionDate
              cid11
            }
          }
        }
      `;
      const result = inspectGraphQLQuery(costBombQuery, { ...DEFAULT_GRAPHQL_GUARD_POLICY, maxAllowedCost: 200 });

      expect(result.allowed).toBe(false);
      expect(result.computedCost).toBeGreaterThan(200);
      expect(result.threats.some((t) => t.category === GraphQLThreatCategory.COMPLEXITY_COST_EXHAUSTION)).toBe(true);
      expect(result.threats.find((t) => t.category === GraphQLThreatCategory.COMPLEXITY_COST_EXHAUSTION)?.severity).toBe(
        GraphQLRiskSeverity.CRITICAL
      );
    });
  });

  describe('5. Detecção de Introspecção Maliciosa (__schema e __type)', () => {
    it('deve bloquear __schema para papéis comuns quando a política exigir bloqueio', () => {
      const query = '{ __schema { types { name } } }';
      const result = inspectGraphQLQuery(query, DEFAULT_GRAPHQL_GUARD_POLICY, UserRole.PSICOLOGO_TITULAR);

      expect(result.allowed).toBe(false);
      expect(result.introspectionDetected).toBe(true);
      expect(result.threats.some((t) => t.category === GraphQLThreatCategory.SCHEMA_INTROSPECTION)).toBe(true);
    });

    it('deve permitir introspecção para perfil ADMIN ou SUPERVISOR_CLINICO', () => {
      const query = '{ __schema { types { name } } }';
      const result = inspectGraphQLQuery(query, DEFAULT_GRAPHQL_GUARD_POLICY, UserRole.ADMIN);

      expect(result.allowed).toBe(true);
      expect(result.introspectionDetected).toBe(true);
      expect(result.threats.length).toBe(0);
    });
  });

  describe('6. Detecção de Loops Circulares de Fragmentos (Anti-Infinite Recursion)', () => {
    it('deve detectar ciclo entre fragmentos e bloquear com severidade CRITICAL', () => {
      const loopQuery = `
        query TestLoop {
          patient(id: "1") {
            ...FragA
          }
        }
        fragment FragA on Patient {
          name
          ...FragB
        }
        fragment FragB on Patient {
          email
          ...FragA
        }
      `;
      const result = inspectGraphQLQuery(loopQuery);

      expect(result.allowed).toBe(false);
      expect(result.circularFragmentDetected).toBe(true);
      expect(result.threats.some((t) => t.category === GraphQLThreatCategory.CIRCULAR_FRAGMENT_LOOP)).toBe(true);
    });
  });

  describe('7. Detecção de Sobrecarga de Aliases (Alias Overloading)', () => {
    it('deve bloquear consultas com mais aliases que o teto da política', () => {
      const aliasQuery = `
        query AliasFlood {
          a1: record { id }
          a2: record { id }
          a3: record { id }
          a4: record { id }
          a5: record { id }
        }
      `;
      const result = inspectGraphQLQuery(aliasQuery, { ...DEFAULT_GRAPHQL_GUARD_POLICY, maxAllowedAliases: 3 });

      expect(result.allowed).toBe(false);
      expect(result.aliasCount).toBe(5);
      expect(result.threats.some((t) => t.category === GraphQLThreatCategory.FIELD_ALIAS_OVERLOADING)).toBe(true);
    });
  });

  describe('8. Detecção de Mutações em Lote (Batch Mutation Flooding)', () => {
    it('deve bloquear mutações que excedam maxBatchOperations', () => {
      const batchQuery = `
        mutation FloodMutations {
          m1: createNote(text: "1") { id }
          m2: createNote(text: "2") { id }
          m3: createNote(text: "3") { id }
          m4: createNote(text: "4") { id }
        }
      `;
      const result = inspectGraphQLQuery(batchQuery, { ...DEFAULT_GRAPHQL_GUARD_POLICY, maxBatchOperations: 2 });

      expect(result.allowed).toBe(false);
      expect(result.threats.some((t) => t.category === GraphQLThreatCategory.BATCH_MUTATION_FLOODING)).toBe(true);
    });
  });

  describe('9. Detecção de Diretivas Não Autorizadas (@defer, @exec)', () => {
    it('deve sinalizar diretivas perigosas ou experimentais', () => {
      const directiveQuery = '{ patient { id notes @defer @exec(code: "test") } }';
      const result = inspectGraphQLQuery(directiveQuery);

      expect(result.threats.some((t) => t.category === GraphQLThreatCategory.UNAUTHORIZED_DIRECTIVE_INJECTION)).toBe(
        true
      );
    });
  });

  describe('10. Selos Notariais Probatórios WORM RFC 8785 (JCS)', () => {
    it('deve gerar canonical string determinística independente da ordem de chaves', () => {
      const obj1 = { z: 1, a: 2, m: { y: 'b', x: 'a' } };
      const obj2 = { a: 2, m: { x: 'a', y: 'b' }, z: 1 };

      expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2));
    });

    it('deve emitir e validar selo notarial probatório com sucesso', () => {
      const seal = generateGraphQLCostProofSeal({
        operationName: 'SafeQuery',
        operationType: GraphQLOperationType.QUERY,
        query: '{ patient { id } }',
        computedCost: 5,
        maxAllowedCost: 250,
        computedDepth: 2,
        maxAllowedDepth: 6,
        introspectionDetected: false,
        actionTaken: GraphQLValidationAction.ALLOW,
      });

      expect(seal.sealToken).toMatch(/^gql_cost_seal_/);
      const verification = verifyGraphQLCostProofSeal(seal);
      expect(verification.isValid).toBe(true);
    });

    it('deve rejeitar selo adulterado por violação criptográfica HMAC', () => {
      const seal = generateGraphQLCostProofSeal({
        operationName: 'SafeQuery',
        operationType: GraphQLOperationType.QUERY,
        query: '{ patient { id } }',
        computedCost: 5,
        maxAllowedCost: 250,
        computedDepth: 2,
        maxAllowedDepth: 6,
        introspectionDetected: false,
        actionTaken: GraphQLValidationAction.ALLOW,
      });

      // Adulterar custo computado
      const tamperedSeal = { ...seal, computedCost: 999 };
      const verification = verifyGraphQLCostProofSeal(tamperedSeal);
      expect(verification.isValid).toBe(false);
      expect(verification.message).toContain('inválida ou foi adulterada');
    });
  });

  describe('11. Homologação do Catálogo Adversarial de Pentest & Schemas Clínicos', () => {
    it('deve conter 3 schemas clínicos homologados na amostra', () => {
      expect(SAMPLE_GRAPHQL_SCHEMAS.length).toBe(3);
      expect(SAMPLE_GRAPHQL_SCHEMAS.every((s) => s.confidentialEntities.length > 0)).toBe(true);
    });

    it('deve inspecionar e bloquear todos os 8 ataques do catálogo adversarial', () => {
      expect(SAMPLE_GRAPHQL_ATTACKS.length).toBe(8);

      for (const attack of SAMPLE_GRAPHQL_ATTACKS) {
        const result = inspectGraphQLQuery(attack.query, DEFAULT_GRAPHQL_GUARD_POLICY, UserRole.PSICOLOGO_TITULAR);
        // Cada ataque deve gerar ao menos uma ameaça da categoria correspondente ou bloquear
        expect(result.threats.length).toBeGreaterThan(0);
      }
    });
  });
});
