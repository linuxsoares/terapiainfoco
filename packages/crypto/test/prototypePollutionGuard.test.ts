import { describe, it, expect } from 'bun:test';
import {
  isDangerousKey,
  createCleanDictionary,
  safeFreezeRecursively,
  safeDeepMerge,
  scanAndSanitizePayload,
  createPollutionProofSeal,
  verifyPollutionSeal,
  DANGEROUS_PROTO_KEYS
} from '../src/prototypePollutionGuard';
import {
  PollutionAttackVector,
  PollutionThreatSeverity,
  SanitizationStrategy,
  PayloadCategory
} from '@terapiainfoco/shared';

describe('Prototype Pollution & Insecure Deserialization Guard (OWASP ASVS V5.5 / CWE-1321)', () => {
  describe('Primitivas de Detecção e Estruturas Seguras', () => {
    it('deve identificar corretamente todas as chaves perigosas reservadas', () => {
      expect(isDangerousKey('__proto__')).toBe(true);
      expect(isDangerousKey('constructor')).toBe(true);
      expect(isDangerousKey('prototype')).toBe(true);
      expect(isDangerousKey('__defineGetter__')).toBe(true);
      expect(isDangerousKey('__defineSetter__')).toBe(true);
      expect(isDangerousKey('__lookupGetter__')).toBe(true);
      expect(isDangerousKey('__lookupSetter__')).toBe(true);

      expect(isDangerousKey('patientId')).toBe(false);
      expect(isDangerousKey('clinicalNotes')).toBe(false);
      expect(isDangerousKey('cid11')).toBe(false);
    });

    it('deve instanciar dicionários limpos com protótipo nulo sem herança de Object.prototype', () => {
      const cleanDict = createCleanDictionary<string>();
      cleanDict.foo = 'bar';

      expect(cleanDict.foo).toBe('bar');
      expect((cleanDict as any).toString).toBeUndefined();
      expect((cleanDict as any).valueOf).toBeUndefined();
      expect(Object.getPrototypeOf(cleanDict)).toBeNull();
    });

    it('deve congelar objetos recursivamente de forma imutável', () => {
      const deepObj = {
        level1: {
          level2: {
            value: 42
          }
        }
      };

      safeFreezeRecursively(deepObj);
      expect(Object.isFrozen(deepObj)).toBe(true);
      expect(Object.isFrozen(deepObj.level1)).toBe(true);
      expect(Object.isFrozen(deepObj.level1.level2)).toBe(true);
    });
  });

  describe('Varredura e Mitigação de Vetores Maliciosos (scanAndSanitizePayload)', () => {
    it('deve aprovar sem ameaças um payload clínico legítimo', () => {
      const legitSoap = {
        patientId: 'pat_001',
        soap: {
          subjective: 'Paciente relata melhora na ansiedade.',
          objective: 'Humor estável, sem ideação depressiva.',
          assessment: 'Evolução clínica favorável (F41.1).',
          plan: 'Manter psicoterapia semanal.'
        },
        tags: ['ansiedade', 'progresso', 'cognitivo']
      };

      const result = scanAndSanitizePayload(legitSoap, PayloadCategory.SOAP_EVOLUTION);

      expect(result.isClean).toBe(true);
      expect(result.threatsDetected.length).toBe(0);
      expect(result.sanitizedObject.patientId).toBe('pat_001');
      expect(result.sanitizedObject.soap.assessment).toContain('F41.1');
      expect(result.proofSeal.isClean).toBe(true);
    });

    it('deve detectar e desarmar injeção direta de __proto__ (CWE-1321)', () => {
      // Simulação de payload JSON malicioso tentando poluir isAdmin no protótipo
      const maliciousJson = '{"title":"Anamnese","__proto__":{"isAdmin":true,"role":"SUPER_ADMIN"}}';
      const parsed = JSON.parse(maliciousJson);

      const result = scanAndSanitizePayload(parsed, PayloadCategory.CLINICAL_ANAMNESIS);

      expect(result.isClean).toBe(false);
      expect(result.threatsDetected.length).toBeGreaterThan(0);

      const protoThreat = result.threatsDetected.find(t => t.vector === PollutionAttackVector.PROTO_POLLUTION);
      expect(protoThreat).toBeDefined();
      expect(protoThreat?.severity).toBe(PollutionThreatSeverity.CRITICAL);
      expect(protoThreat?.maliciousKey).toBe('__proto__');

      // Garantir que Object.prototype NÃO foi poluído
      expect((({} as any).isAdmin)).toBeUndefined();
      expect((({} as any).role)).toBeUndefined();

      // Garantir que o objeto sanitizado não contém a chave
      expect((result.sanitizedObject as any).__proto__).toBeUndefined();
    });

    it('deve neutralizar injeção de constructor.prototype em objetos aninhados', () => {
      const payloadWithConstructor = {
        clinicalRecord: {
          notes: 'Paciente em crise de pânico.',
          constructor: {
            prototype: {
              backdoorActive: true
            }
          }
        }
      };

      const result = scanAndSanitizePayload(payloadWithConstructor, PayloadCategory.CLINICAL_ANAMNESIS);

      expect(result.isClean).toBe(false);
      const threat = result.threatsDetected.find(t => t.maliciousKey === 'constructor');
      expect(threat).toBeDefined();
      expect(threat?.vector).toBe(PollutionAttackVector.CONSTRUCTOR_PROTOTYPE);
      expect((({} as any).backdoorActive)).toBeUndefined();
    });

    it('deve desarmar e isolar referências circulares (Circular Reference Bomb)', () => {
      const circularObj: any = {
        name: 'Registro com loop circular',
        metadata: {}
      };
      circularObj.metadata.parent = circularObj; // Loop circular

      const result = scanAndSanitizePayload(circularObj, PayloadCategory.CLINICAL_ANAMNESIS);

      expect(result.isClean).toBe(false);
      const circThreat = result.threatsDetected.find(t => t.vector === PollutionAttackVector.CIRCULAR_REFERENCE_BOMB);
      expect(circThreat).toBeDefined();
      expect(circThreat?.severity).toBe(PollutionThreatSeverity.HIGH);
      expect(result.sanitizedObject.metadata.parent).toBe('[SANITIZED_CIRCULAR_REF]');
    });

    it('deve barrar payload com profundidade de aninhamento excessiva (> 10 níveis)', () => {
      let nested: any = { value: 'leaf' };
      for (let i = 0; i < 15; i++) {
        nested = { child: nested };
      }

      const result = scanAndSanitizePayload(nested, PayloadCategory.CLINICAL_ANAMNESIS, { maxDepth: 10 });

      expect(result.isClean).toBe(false);
      const depthThreat = result.threatsDetected.find(t => t.vector === PollutionAttackVector.NESTED_DEPTH_OVERFLOW);
      expect(depthThreat).toBeDefined();
      expect(depthThreat?.severity).toBe(PollutionThreatSeverity.MEDIUM);
    });

    it('deve detectar tentativa de desserialização insegura com padrões RCE (ex: node-serialize / eval)', () => {
      const payloadWithRce = {
        webhookConfig: {
          callback: '_$$ND_FUNC$$_function(){ require("child_process").exec("rm -rf /"); }()'
        }
      };

      const result = scanAndSanitizePayload(payloadWithRce, PayloadCategory.TELECONSULT_CONFIG);

      expect(result.isClean).toBe(false);
      const deserThreat = result.threatsDetected.find(t => t.vector === PollutionAttackVector.INSECURE_DESERIALIZATION);
      expect(deserThreat).toBeDefined();
      expect(deserThreat?.severity).toBe(PollutionThreatSeverity.CRITICAL);
    });

    it('deve aplicar estratégia FAIL_FAST_REJECT descartando totalmente o objeto em caso de ameaça crítica', () => {
      const dangerousPayload = JSON.parse('{"__proto__": {"polluted": true}, "data": "dados legítimos"}');

      const result = scanAndSanitizePayload(dangerousPayload, PayloadCategory.CONSENT_RECORD, {
        strategy: SanitizationStrategy.FAIL_FAST_REJECT
      });

      expect(result.isClean).toBe(false);
      expect(result.sanitizedObject).toBeNull();
    });
  });

  describe('Deep Merge Seguro (safeDeepMerge)', () => {
    it('deve realizar merge profundo preservando valores sem permitir vazamento de __proto__', () => {
      const target = {
        config: {
          theme: 'dark',
          volume: 80
        }
      };

      const sourceWithMalice = JSON.parse('{"config":{"volume":90},"__proto__":{"pollutedKey":"hacked"}}');

      const merged = safeDeepMerge(target, sourceWithMalice);

      expect(merged.config.theme).toBe('dark');
      expect(merged.config.volume).toBe(90);
      expect((({} as any).pollutedKey)).toBeUndefined();
    });
  });

  describe('Selo Probatório Forense WORM RFC 8785', () => {
    it('deve emitir e validar com 100% de sucesso um selo íntegro', () => {
      const seal = createPollutionProofSeal({
        scanId: 'scan_unit_test_001',
        category: PayloadCategory.CLINICAL_ANAMNESIS,
        threatsCount: 0,
        isClean: true,
        timestamp: '2026-10-16T11:00:00.000Z'
      });

      expect(seal.signature.startsWith('proto_guard_v1_')).toBe(true);

      const verification = verifyPollutionSeal(seal.signature);
      expect(verification.isValid).toBe(true);
      expect(verification.seal?.scanId).toBe('scan_unit_test_001');
      expect(verification.seal?.isClean).toBe(true);
    });

    it('deve acusar falha de integridade se o selo for adulterado', () => {
      const seal = createPollutionProofSeal({
        scanId: 'scan_unit_test_002',
        category: PayloadCategory.SOAP_EVOLUTION,
        threatsCount: 2,
        isClean: false,
        timestamp: '2026-10-16T11:05:00.000Z'
      });

      // Simular adulteração no payload Base64
      const parts = seal.signature.split('_');
      const corruptedSignature = `proto_guard_v1_${parts[3].slice(0, -6)}AAAAAA`;

      const verification = verifyPollutionSeal(corruptedSignature);
      expect(verification.isValid).toBe(false);
    });

    it('deve rejeitar tokens malformados ou com prefixos inválidos', () => {
      const verification = verifyPollutionSeal('invalid_prefix_token_12345');
      expect(verification.isValid).toBe(false);
      expect(verification.message).toContain('Token de selo inválido');
    });
  });
});
