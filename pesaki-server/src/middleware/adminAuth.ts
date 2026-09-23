import { FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: { id: string; email?: string; role?: string };
  }
}

export const verifyAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ success: false, error: 'Missing or invalid Authorization header', code: 'MISSING_HEADER' });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    logger.warn({ message: error?.message }, 'Admin token verification failed');
    return reply.code(401).send({ success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
  }

  const { data: adminRow, error: adminError } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError) {
    logger.error({ error: adminError.message }, 'Admin role lookup failed');
    return reply.code(500).send({ success: false, error: 'Database error', code: 'DB_ERROR' });
  }

  if (!adminRow) {
    return reply.code(403).send({ success: false, error: 'Admin access required', code: 'FORBIDDEN' });
  }

  request.adminUser = { id: user.id, email: user.email, role: adminRow.role };
};
