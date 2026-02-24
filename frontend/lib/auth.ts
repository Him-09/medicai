const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  specialty?: string;
  clinic_id?: string;
}

interface LoginParams {
  email: string;
  password: string;
}

interface RegisterParams {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  specialty: string;
  clinic_name: string;
  phone?: string;
  license_number?: string;
}

interface LoginResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  message?: string;
}

interface RegisterResponse {
  message: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  clinic_id?: string;
  user_id?: string;
}

class AuthService {
  private tokenKey = 'medicai_token';
  private userKey = 'medicai_user';

  async login(params: LoginParams): Promise<LoginResponse> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed');
    }

    const data: LoginResponse = await res.json();

    if (data.access_token) {
      localStorage.setItem(this.tokenKey, data.access_token);
      await this.fetchAndStoreUser(data.access_token);
    }

    return data;
  }

  async register(params: RegisterParams): Promise<RegisterResponse> {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed');
    }

    const data: RegisterResponse = await res.json();

    if (data.access_token) {
      localStorage.setItem(this.tokenKey, data.access_token);
      await this.fetchAndStoreUser(data.access_token);
    }

    return data;
  }

  async fetchSpecialities(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/api/auth/specialities`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.specialities || [];
  }

  private async fetchAndStoreUser(token: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const user = await res.json();
        localStorage.setItem(this.userKey, JSON.stringify(user));
      }
    } catch {
      // ignore
    }
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey);
  }

  getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  logout(): void {
    const token = this.getToken();
    if (token) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }
}

export const authService = new AuthService();
