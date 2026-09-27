import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
export async function requireStaff() {
 const session = await auth.api.getSession({headers:await headers()});
 if (!session || !['ADMIN','CASHIER'].includes(session.user.role)) throw new Error('Sign in required');
 return session;
}
