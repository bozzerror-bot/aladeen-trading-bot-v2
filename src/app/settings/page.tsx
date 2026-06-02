'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => { router.push('/'); }, [router]);
  return <div style={{ background: '#030712', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Redirecting...</div>;
}
