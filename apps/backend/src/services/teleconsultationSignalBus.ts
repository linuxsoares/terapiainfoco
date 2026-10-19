import { randomUUID } from 'node:crypto';
import type { WebRtcSignalEnvelope } from '@terapiainfoco/shared';

/**
 * Barramento efêmero de sinalização WebRTC por consulta (SDP e candidatos ICE).
 *
 * Fica fora do entity_store de propósito: sinais só têm valor durante a negociação e, após
 * um restart do servidor, os participantes simplesmente renegociam. O cursor carrega a
 * época do barramento ("época:seq") para que clientes detectem o restart e recomecem do zero.
 */

const MAX_SIGNALS_PER_ROOM = 300;

interface RoomBus {
  epoch: string;
  seq: number;
  signals: WebRtcSignalEnvelope[];
}

const buses = new Map<string, RoomBus>();

function busFor(appointmentId: string): RoomBus {
  let bus = buses.get(appointmentId);
  if (!bus) {
    bus = { epoch: randomUUID().slice(0, 8), seq: 0, signals: [] };
    buses.set(appointmentId, bus);
  }
  return bus;
}

export const TeleconsultationSignalBus = {
  publish(signal: Omit<WebRtcSignalEnvelope, 'id' | 'seq' | 'createdAt'>): WebRtcSignalEnvelope {
    const bus = busFor(signal.appointmentId);
    const envelope: WebRtcSignalEnvelope = {
      ...signal,
      id: `sig_${randomUUID().slice(0, 12)}`,
      seq: ++bus.seq,
      createdAt: new Date().toISOString()
    };
    bus.signals.push(envelope);
    if (bus.signals.length > MAX_SIGNALS_PER_ROOM) {
      bus.signals = bus.signals.slice(-MAX_SIGNALS_PER_ROOM);
    }
    return envelope;
  },

  /** Sinais enviados pela outra parte depois do cursor, e o novo cursor */
  since(appointmentId: string, cursor: string | undefined, receiverId: string): { signals: WebRtcSignalEnvelope[]; cursor: string } {
    const bus = busFor(appointmentId);
    const [epoch, seqText] = (cursor ?? '').split(':');
    const after = epoch === bus.epoch ? Number(seqText) || 0 : 0;
    return {
      signals: bus.signals.filter((s) => s.seq > after && s.senderId !== receiverId),
      cursor: `${bus.epoch}:${bus.seq}`
    };
  },

  clear(appointmentId: string): void {
    buses.delete(appointmentId);
  }
};
