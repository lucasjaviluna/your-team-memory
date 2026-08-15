import React from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { LoadingPanel, ErrorPanel, Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import type { Screen } from "../types.js";

interface User {
  id: string;
  username: string;
  email: string | null;
  role: "reader" | "writer" | "admin";
  created_at: string;
  revoked_at: string | null;
  active_tokens: number;
  last_active: string | null;
}

interface Invite {
  token: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  created_by: string;
  used_by_username: string | null;
}

interface Props {
  url: string;
  apiToken: string;
  onNavigate: (s: Screen) => void;
}

type Mode =
  | "menu"
  | "users"
  | "invites"
  | "create-invite"
  | "user-detail"
  | "generating-token"
  | "done";

// Use a safe, project-local type for fetch options to avoid depending on DOM lib
type FetchOpts = {
  headers?: Record<string, string>;
  method?: string;
  body?: any;
  [key: string]: any;
};

async function authFetch<T>(
  url: string,
  token: string,
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const res = await fetch(url.replace(/\/mcp\/?$/, path), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
  const data = (await res.json()) as T;
  if (!res.ok)
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

const MENU_ITEMS = [
  { label: "👥  Gestionar usuarios", value: "users" },
  { label: "📨  Crear invite token", value: "create-invite" },
  { label: "📋  Ver invites activos", value: "invites" },
];

const ROLE_ITEMS = [
  { label: "writer — lectura + escritura (recomendado)", value: "writer" },
  { label: "reader — solo lectura", value: "reader" },
  { label: "admin  — acceso completo", value: "admin" },
];

export function Admin({ url, apiToken, onNavigate }: Props) {
  const [mode, setMode] = React.useState<Mode>("menu");
  const [users, setUsers] = React.useState<User[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedUser, setSelUser] = React.useState<User | null>(null);
  const [inviteRole, setRole] = React.useState<string>("writer");
  const [inviteResult, setInviteResult] = React.useState<string | null>(null);
  const [generatedToken, setGenToken] = React.useState<string | null>(null);
  const [message, setMsg] = React.useState<string | null>(null);

  const load = async (what: "users" | "invites") => {
    setLoading(true);
    setError(null);
    try {
      if (what === "users") {
        const d = await authFetch<{ users: User[] }>(
          url,
          apiToken,
          "/auth/users",
        );
        setUsers(d.users);
        setMode("users");
      } else {
        const d = await authFetch<{ invites: Invite[] }>(
          url,
          apiToken,
          "/auth/invites",
        );
        setInvites(d.invites);
        setMode("invites");
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  const createInvite = async (role: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await authFetch<{ token: string }>(
        url,
        apiToken,
        "/auth/invites",
        {
          method: "POST",
          body: JSON.stringify({ role, expires_in_hours: 48 }),
        },
      );
      setInviteResult(d.token);
      setMode("done");
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  const generateUserToken = async (userId: string) => {
    setMode("generating-token");
    try {
      const d = await authFetch<{ token: string }>(
        url,
        apiToken,
        `/auth/users/${userId}/token`,
        { method: "POST" },
      );
      setGenToken(d.token);
    } catch (e) {
      setError((e as Error).message);
      setMode("user-detail");
    }
  };

  const revokeUser = async (userId: string, username: string) => {
    try {
      await authFetch(url, apiToken, `/auth/users/${userId}`, {
        method: "DELETE",
      });
      setMsg(`Usuario '${username}' revocado.`);
      await load("users");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "menu") onNavigate("dashboard");
      else {
        setMode("menu");
        setError(null);
        setMsg(null);
        setSelUser(null);
      }
    }
    if (input === "q") process.exit(0);
  });

  if (loading) return <LoadingPanel label="Cargando..." />;

  // ── Menú principal ──────────────────────────────────────────────────────────
  if (mode === "menu") {
    return (
      <Box flexDirection="column" gap={1}>
        <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={0}>
          <Text bold color="red">
            ⚙ Panel de administración
          </Text>
        </Box>
        {error && <ErrorPanel message={error} />}
        {message && (
          <Box paddingX={1}>
            <Text color="green">✓ {message}</Text>
          </Box>
        )}
        <SelectInput
          items={MENU_ITEMS}
          onSelect={(item) => {
            if (item.value === "users") load("users");
            if (item.value === "invites") load("invites");
            if (item.value === "create-invite") setMode("create-invite");
          }}
        />
        <StatusBar
          keys={[
            { key: "Esc", label: "Volver al dashboard" },
            { key: "q", label: "Salir" },
          ]}
        />
      </Box>
    );
  }

  // ── Lista de usuarios ───────────────────────────────────────────────────────
  if (mode === "users") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="white">
          {users.length} usuarios
        </Text>
        {users.map((u) => {
          const revoked = !!u.revoked_at;
          return (
            <Box
              key={u.id}
              gap={2}
              paddingX={1}
              borderStyle="single"
              borderColor={revoked ? "gray" : "gray"}
            >
              <Text color={revoked ? "gray" : "white"} bold>
                {u.username}
              </Text>
              <Text
                color={
                  u.role === "admin"
                    ? "red"
                    : u.role === "writer"
                      ? "green"
                      : "blue"
                }
              >
                {u.role}
              </Text>
              <Text dimColor>
                {u.active_tokens} token{u.active_tokens !== 1 ? "s" : ""}
              </Text>
              {u.last_active && (
                <Text dimColor>
                  últ: {new Date(u.last_active).toLocaleDateString("es")}
                </Text>
              )}
              {revoked && (
                <Text color="gray" dimColor>
                  [revocado]
                </Text>
              )}
              {!revoked && (
                <SelectInput
                  items={[{ label: `acciones → ${u.username}`, value: u.id }]}
                  onSelect={() => {
                    setSelUser(u);
                    setMode("user-detail");
                  }}
                />
              )}
            </Box>
          );
        })}
        <StatusBar
          keys={[{ key: "Esc", label: "Volver" }]}
          error={error ?? undefined}
        />
      </Box>
    );
  }

  // ── Detalle de usuario ──────────────────────────────────────────────────────
  if (mode === "user-detail" && selectedUser) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box
          borderStyle="round"
          borderColor="gray"
          paddingX={2}
          flexDirection="column"
        >
          <Text bold color="white">
            {selectedUser.username}
          </Text>
          <Box gap={2}>
            <Text color="gray">
              rol: <Text color="cyan">{selectedUser.role}</Text>
            </Text>
            <Text dimColor>tokens activos: {selectedUser.active_tokens}</Text>
          </Box>
        </Box>
        <SelectInput
          items={[
            {
              label: "🔑  Generar nuevo token (perdió el suyo)",
              value: "gen-token",
            },
            {
              label: "🚫  Revocar usuario + todos sus tokens",
              value: "revoke",
            },
            { label: "← Volver", value: "back" },
          ]}
          onSelect={(item) => {
            if (item.value === "gen-token") generateUserToken(selectedUser.id);
            if (item.value === "revoke")
              revokeUser(selectedUser.id, selectedUser.username);
            if (item.value === "back") setMode("users");
          }}
        />
        {error && <ErrorPanel message={error} />}
        <StatusBar keys={[{ key: "Esc", label: "Volver" }]} />
      </Box>
    );
  }

  // ── Token generado para usuario ─────────────────────────────────────────────
  if (mode === "generating-token" && generatedToken) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box
          borderStyle="round"
          borderColor="green"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
          gap={1}
        >
          <Text bold color="green">
            ✓ Token generado para {selectedUser?.username}
          </Text>
          <Text dimColor>Compartilo por un canal seguro:</Text>
          <Text bold color="cyan">
            {generatedToken}
          </Text>
          <Text dimColor>El usuario instala con:</Text>
          <Text color="gray">
            npx github:tu-org/team-memory install --token{" "}
            {generatedToken.slice(0, 20)}...
          </Text>
        </Box>
        <StatusBar keys={[{ key: "Esc", label: "Volver" }]} />
      </Box>
    );
  }

  // ── Crear invite ────────────────────────────────────────────────────────────
  if (mode === "create-invite") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Rol para el invite:</Text>
        <Text dimColor>El invite expira en 48hs y es de un solo uso.</Text>
        <SelectInput
          items={ROLE_ITEMS}
          onSelect={(item) => {
            setRole(item.value);
            createInvite(item.value);
          }}
        />
        <StatusBar keys={[{ key: "Esc", label: "Cancelar" }]} />
      </Box>
    );
  }

  // ── Resultado invite ────────────────────────────────────────────────────────
  if (mode === "done" && inviteResult) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box
          borderStyle="round"
          borderColor="green"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
          gap={1}
        >
          <Text bold color="green">
            ✓ Invite token creado (rol: {inviteRole})
          </Text>
          <Text dimColor>Válido por 48 horas · un solo uso</Text>
          <Text bold color="cyan">
            {inviteResult}
          </Text>
          <Text dimColor>El usuario instala con:</Text>
          <Text color="gray">
            npx github:tu-org/team-memory install --invite {inviteResult}
          </Text>
        </Box>
        <StatusBar keys={[{ key: "Esc", label: "Volver al menú" }]} />
      </Box>
    );
  }

  // ── Lista de invites ────────────────────────────────────────────────────────
  if (mode === "invites") {
    const active = invites.filter(
      (i) => !i.used_at && new Date(i.expires_at) > new Date(),
    );
    const expired = invites.filter(
      (i) => i.used_at || new Date(i.expires_at) <= new Date(),
    );
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>
          {active.length} activos · {expired.length} usados/vencidos
        </Text>
        {active.map((i) => (
          <Box
            key={i.token}
            gap={2}
            paddingX={1}
            borderStyle="single"
            borderColor="gray"
          >
            <Text color="cyan" bold>
              {i.token.slice(0, 20)}…
            </Text>
            <Text
              color={
                i.role === "admin"
                  ? "red"
                  : i.role === "writer"
                    ? "green"
                    : "blue"
              }
            >
              {i.role}
            </Text>
            <Text dimColor>
              vence: {new Date(i.expires_at).toLocaleDateString("es")}
            </Text>
            <Text dimColor>creado por: {i.created_by}</Text>
          </Box>
        ))}
        {active.length === 0 && (
          <Box paddingX={1}>
            <Text dimColor>No hay invites activos.</Text>
          </Box>
        )}
        <StatusBar
          keys={[{ key: "Esc", label: "Volver" }]}
          error={error ?? undefined}
        />
      </Box>
    );
  }

  return null;
}
