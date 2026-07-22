import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserProfile } from '@/types';

function getRoleHome(profile: UserProfile): string {
  if (profile.role === 'employer') return '/app/employer';
  return '/app/worker';
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Admin protection
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    const admin = createAdminClient();
    const { data: adminUser } = await admin
      .from('users')
      .select('is_admin, is_suspended')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminUser?.is_admin) {
      const url = request.nextUrl.clone();
      url.pathname = '/app/worker';
      return NextResponse.redirect(url);
    }

    return response;
  }

  const publicPaths = ['/', '/login', '/register'];
  const isPublic = publicPaths.includes(pathname);

  if (!user) {
    if (pathname.startsWith('/app') || pathname.startsWith('/verification-pending')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    return response;
  }

  // Check suspended for /app routes
  if (pathname.startsWith('/app')) {
    const admin = createAdminClient();
    const { data: appUser } = await admin
      .from('users')
      .select('is_suspended, delete_requested_at')
      .eq('id', user.id)
      .maybeSingle();

    if (appUser?.is_suspended) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<UserProfile>();

  const metadataRole = user.user_metadata?.role as string | undefined;
  const effectiveRole = profile?.role ?? metadataRole ?? 'worker';

  if (isPublic) {
    const url = request.nextUrl.clone();

    if (!profile || !profile.onboarding_completed) {
      url.pathname = `/onboarding/${effectiveRole === 'employer' ? 'employer' : 'worker'}`;
      return NextResponse.redirect(url);
    }

    if (profile.verification_status !== 'approved') {
      url.pathname = '/verification-pending';
      return NextResponse.redirect(url);
    }

    url.pathname = getRoleHome(profile);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/onboarding')) {
    if (profile?.onboarding_completed) {
      const url = request.nextUrl.clone();

      if (profile.verification_status !== 'approved') {
        url.pathname = '/verification-pending';
      } else {
        url.pathname = getRoleHome(profile);
      }

      return NextResponse.redirect(url);
    }

    return response;
  }

  if (pathname.startsWith('/app')) {
    if (!profile || !profile.onboarding_completed) {
      const url = request.nextUrl.clone();
      url.pathname = `/onboarding/${effectiveRole === 'employer' ? 'employer' : 'worker'}`;
      return NextResponse.redirect(url);
    }

    if (profile.verification_status !== 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = '/verification-pending';
      return NextResponse.redirect(url);
    }

    return response;
  }

  if (pathname.startsWith('/verification-pending')) {
    if (profile?.verification_status === 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = getRoleHome(profile);
      return NextResponse.redirect(url);
    }

    return response;
  }

  return response;
}
