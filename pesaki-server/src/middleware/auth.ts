import { FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email?: string };
  }
}

export const verifyAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      logger.warn('No Authorization header provided');
      return reply.code(401).send({ success: false, error: 'Missing Authorization header', code: 'MISSING_HEADER' });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('Invalid Authorization format');
      return reply.code(401).send({ success: false, error: 'Invalid Authorization format (expected Bearer token)', code: 'INVALID_FORMAT' });
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    
    // Verify token using Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn({ message: error?.message }, 'Token verification failed');
      return reply.code(401).send({ success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
    }

    // Attach user to request context
    request.user = { id: user.id, email: user.email };
  } catch (error) {
    logger.error(error, 'Auth middleware error');
    return reply.code(500).send({ success: false, error: 'Internal server error during authentication', code: 'INTERNAL_ERROR' });
  }
};
