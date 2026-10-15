import { describe, it, expect } from 'bun:test';
import {
  SlidingWindowAntiReplay,
  RotatingBloomFilter,
  NonceReuseDetector,
  issueAntiReplayProofSeal,
  verifyAntiReplayProofSeal
} from '../src/antiReplayShield';
import {
  ReplayThreatSeverity,
  ReplayTargetProtocol,
  ReplayDefenseMode
} from '@terapiainfoco/shared';

describe('Anti-Replay & Nonce-Reuse Shield Crypto Engine (RFC 8446, RFC 9147 DTLS 1.3 & OWASP API Security)', () => {
  describe('Janela Deslizante Anti-Replay (RFC 6479 & RFC 4303)', () => {
    it('deve aceitar o primeiro pacote da sessão e inicializar a janela', () => {
      const window = new SlidingWindowAntiReplay('channel_teleconsulta_1', 64);
      const res = window.checkAndMark(1);

      expect(res.allowed).toBe(true);
      expect(res.severity).toBe(ReplayThreatSeverity.BENIGN_IN_ORDER);
      expect(res.position.sequenceNumber).toBe(1);
      expect(res.position.highestSequence).toBe(1);
      expect(res.position.bitIndex).toBe(0);
    });

    it('deve aceitar pacotes estritamente sequenciais e avançar o highestSequence', () => {
      const window = new SlidingWindowAntiReplay('channel_teleconsulta_1', 64);
      window.checkAndMark(1);
      const res2 = window.checkAndMark(2);
      const res3 = window.checkAndMark(3);

      expect(res2.allowed).toBe(true);
      expect(res3.allowed).toBe(true);
      expect(window.getStatus().highestSequenceNumber).toBe(3);
      expect(window.getStatus().packetsAccepted).toBe(3);
    });

    it('deve aceitar pacotes fora de ordem desde que dentro da janela tolerada', () => {
      const window = new SlidingWindowAntiReplay('channel_teleconsulta_1', 64);
      window.checkAndMark(10); // Avança até 10

      // Pacote 8 chega atrasado, mas está dentro da janela (diff = 2 < 64)
      const res8 = window.checkAndMark(8);
      expect(res8.allowed).toBe(true);
      expect(res8.severity).toBe(ReplayThreatSeverity.BENIGN_IN_ORDER);
      expect(res8.position.bitIndex).toBe(2);

      // Pacote 5 chega atrasado (diff = 5 < 64)
      const res5 = window.checkAndMark(5);
      expect(res5.allowed).toBe(true);
      expect(res5.position.bitIndex).toBe(5);
    });

    it('deve detectar e rejeitar ataque de replay com pacote duplicado', () => {
      const window = new SlidingWindowAntiReplay('channel_teleconsulta_1', 64);
      window.checkAndMark(20);
      window.checkAndMark(15);

      // Atacante reenviando pacote 15
      const replay = window.checkAndMark(15);
      expect(replay.allowed).toBe(false);
      expect(replay.severity).toBe(ReplayThreatSeverity.DUPLICATE_REPLAY_DETECTED);
      expect(replay.reason).toContain('Ataque de Replay detectado');

      // Reenviando o próprio 20 (cabeça da janela)
      const replayHead = window.checkAndMark(20);
      expect(replayHead.allowed).toBe(false);
      expect(replayHead.severity).toBe(ReplayThreatSeverity.DUPLICATE_REPLAY_DETECTED);
      expect(window.getStatus().packetsReplayed).toBe(2);
    });

    it('deve rejeitar pacotes com sequência retroativa além do limite da janela (Too Old)', () => {
      const window = new SlidingWindowAntiReplay('channel_teleconsulta_1', 64);
      window.checkAndMark(100);

      // Pacote 35 (diff = 65 > 64) está fora da janela
      const tooOld = window.checkAndMark(35);
      expect(tooOld.allowed).toBe(false);
      expect(tooOld.severity).toBe(ReplayThreatSeverity.OUT_OF_WINDOW_EXPIRED);
      expect(tooOld.reason).toContain('atrasado além do limite');
      expect(window.getStatus().packetsOutOfWindow).toBe(1);
    });

    it('deve suportar saltos gigantes à frente sem corromper o estado da janela', () => {
      const window = new SlidingWindowAntiReplay('channel_teleconsulta_1', 64);
      window.checkAndMark(10);

      // Salto gigante para 200 (delta = 190 >= 64)
      const leap = window.checkAndMark(200);
      expect(leap.allowed).toBe(true);
      expect(window.getStatus().highestSequenceNumber).toBe(200);

      // Pacote 10 agora está expirado
      const old = window.checkAndMark(10);
      expect(old.allowed).toBe(false);
      expect(old.severity).toBe(ReplayThreatSeverity.OUT_OF_WINDOW_EXPIRED);
    });

    it('deve rejeitar sequências menores ou iguais a zero', () => {
      const window = new SlidingWindowAntiReplay('channel_teleconsulta_1', 64);
      const invalid = window.checkAndMark(0);
      expect(invalid.allowed).toBe(false);
      expect(invalid.severity).toBe(ReplayThreatSeverity.OUT_OF_WINDOW_EXPIRED);
    });
  });

  describe('Filtro de Bloom Rotativo Temporal (RotatingBloomFilter)', () => {
    it('deve detectar elementos novos e acusar presença após inserção', () => {
      const bloom = new RotatingBloomFilter(1000, 0.001);
      const token1 = 'dpop_nonce_test_abc123';
      const token2 = 'dpop_nonce_test_xyz789';

      expect(bloom.has(token1)).toBe(false);
      bloom.add(token1);
      expect(bloom.has(token1)).toBe(true);

      expect(bloom.has(token2)).toBe(false);
    });

    it('deve reter o histórico recente ao rotacionar a geração', () => {
      const bloom = new RotatingBloomFilter(1000, 0.001);
      const token = 'session_jwt_jti_uuid_555';

      bloom.add(token);
      expect(bloom.has(token)).toBe(true);

      // Rotaciona para Geração 2
      const rotRes = bloom.rotate();
      expect(rotRes.activeGeneration).toBe(2);

      // O elemento da geração anterior ainda deve ser detectado (transição suave sem vazamento)
      expect(bloom.has(token)).toBe(true);

      // Rotaciona novamente para Geração 3 (expirando a geração 1)
      bloom.rotate();
      expect(bloom.has(token)).toBe(false);
    });

    it('deve computar métricas válidas com probabilidade de falso positivo controlada', () => {
      const bloom = new RotatingBloomFilter(2000, 0.001);
      for (let i = 0; i < 50; i++) {
        bloom.add(`sample_nonce_${i}`);
      }

      const metrics = bloom.getMetrics();
      expect(metrics.elementCount).toBe(50);
      expect(metrics.hashFunctionsCount).toBeGreaterThanOrEqual(3);
      expect(metrics.falsePositiveProbability).toBeLessThan(0.01);
      expect(metrics.activeGeneration).toBe(1);
    });
  });

  describe('Detector de Reutilização de Nonce/IV AES-GCM (NonceReuseDetector)', () => {
    it('deve aceitar IV único para uma dada chave mestre', () => {
      const detector = new NonceReuseDetector();
      const res = detector.verifyAndRegisterIv('dek_patient_123', 'a1b2c3d4e5f60718293a4b5c');

      expect(res.unique).toBe(true);
      expect(res.severity).toBe(ReplayThreatSeverity.BENIGN_IN_ORDER);
      expect(res.reason).toContain('único e conforme');
    });

    it('deve detectar e bloquear reutilização de IV para a mesma chave (CRITICAL_NONCE_REUSE)', () => {
      const detector = new NonceReuseDetector();
      const keyId = 'dek_prontuario_paciente_456';
      const reusedIv = '112233445566778899aabbcc';

      const first = detector.verifyAndRegisterIv(keyId, reusedIv);
      expect(first.unique).toBe(true);

      // Segunda apresentação do mesmo IV com a mesma chave: Violação GCM!
      const second = detector.verifyAndRegisterIv(keyId, reusedIv);
      expect(second.unique).toBe(false);
      expect(second.severity).toBe(ReplayThreatSeverity.CRITICAL_NONCE_REUSE);
      expect(second.reason).toContain('VIOLAÇÃO CRÍTICA NIST SP 800-38D');
      expect(second.reason).toContain('impedir ataque GHASH');
    });

    it('deve permitir o mesmo IV para chaves DIFERENTES', () => {
      const detector = new NonceReuseDetector();
      const iv = 'ffffffffffffffffffffffff';

      const resKey1 = detector.verifyAndRegisterIv('key_alpha', iv);
      const resKey2 = detector.verifyAndRegisterIv('key_beta', iv);

      expect(resKey1.unique).toBe(true);
      expect(resKey2.unique).toBe(true);
    });
  });

  describe('Selo Probatório WORM HMAC-SHA256 & RFC 8785', () => {
    it('deve emitir e validar selo probatório anti-replay com sucesso', () => {
      const seal = issueAntiReplayProofSeal(
        'verif_anti_replay_999',
        ReplayTargetProtocol.WEBRTC_DTLS_SRTP,
        ReplayDefenseMode.HYBRID_DEFENSE_WINDOW_PLUS_BLOOM,
        {
          channelId: 'room_webrtc_audited',
          sequence: 45,
          decision: 'ALLOWED',
          timestamp: '2026-10-15T15:00:00Z'
        }
      );

      expect(seal.sealToken).toContain('anti_replay_proof_v1_');
      expect(seal.canonicalDigest).toBeDefined();
      expect(seal.hmacSignature).toBeDefined();

      const verification = verifyAntiReplayProofSeal(seal.sealToken);
      expect(verification.valid).toBe(true);
      expect(verification.seal).toBeDefined();
      expect(verification.seal?.verificationId).toBe('verif_anti_replay_999');
      expect(verification.message).toContain('100% autêntico e inviolado');
    });

    it('deve rejeitar selo adulterado ou com token malformado', () => {
      const invalidToken = 'anti_replay_proof_v1_token_falso_adulterado';
      const res = verifyAntiReplayProofSeal(invalidToken);
      expect(res.valid).toBe(false);

      const emptyRes = verifyAntiReplayProofSeal('token_sem_prefixo');
      expect(emptyRes.valid).toBe(false);
    });
  });
});
