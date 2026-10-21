import { Hono } from 'hono';
import { 
  type CreateClinicalMarkerDTO,
  type UpdateClinicalMarkerDTO
} from '@terapiainfoco/shared';
import { ClinicalMarkerService } from '../services/clinicalMarkerService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, requireAppointmentAccess, requireBodyOwnership, requireOwnedResource } from '../middlewares/accessPolicy';
import { db } from '../db/memoryDb';

export const clinicalMarkersRouter = new Hono();

clinicalMarkersRouter.use('*', authMiddleware(), requireRole(CLINICAL_ROLES), requireBodyOwnership());

/**
 * POST /api/clinical-markers
 * Cria um marcador clínico na sessão (RFC-001 §3.3)
 */
clinicalMarkersRouter.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CreateClinicalMarkerDTO>();

    if (!body.appointmentId || body.timestampMs === undefined || !body.category || !body.note) {
      return c.json({ success: false, error: 'appointmentId, timestampMs, category e note são obrigatórios' }, 400);
    }

    const marker = await ClinicalMarkerService.createMarker(body, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json({ success: true, marker }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/clinical-markers/appointment/:appointmentId
 * Lista marcadores da consulta ordenados cronologicamente
 */
clinicalMarkersRouter.get('/appointment/:appointmentId', requireAppointmentAccess('appointmentId'), async (c) => {
  try {
    const appointmentId = c.req.param('appointmentId');
    const markers = ClinicalMarkerService.getMarkersByAppointment(appointmentId);
    return c.json({ success: true, markers });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * PATCH /api/clinical-markers/:id
 * Atualiza categoria, relevância ou notas do marcador
 */
clinicalMarkersRouter.patch('/:id', requireOwnedResource((id) => db.clinicalMarkers.get(id), 'Marcador'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json<UpdateClinicalMarkerDTO>();

    const marker = ClinicalMarkerService.updateMarker(id, body, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json({ success: true, marker });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * DELETE /api/clinical-markers/:id
 * Remove um marcador clínico
 */
clinicalMarkersRouter.delete('/:id', requireOwnedResource((id) => db.clinicalMarkers.get(id), 'Marcador'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    const result = ClinicalMarkerService.deleteMarker(id, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/clinical-markers/appointment/:appointmentId/soap-proposal
 * Estrutura proposta preliminar de SOAP agrupando os marcadores da sessão (RFC-001 §3.3)
 */
clinicalMarkersRouter.get('/appointment/:appointmentId/soap-proposal', requireAppointmentAccess('appointmentId'), async (c) => {
  try {
    const appointmentId = c.req.param('appointmentId');
    const proposal = ClinicalMarkerService.exportToSoapProposal(appointmentId);
    return c.json(proposal);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
