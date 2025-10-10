"use client";

import { signIn, signOut } from "next-auth/react";
import { siDiscord } from "simple-icons/icons";
import { useRouter } from "next/navigation";
import Image from "next/image";
import * as React from "react";
import { Loader2 } from "lucide-react";

interface AuthButtonProps {
  isAuthenticated: boolean;
  userImage: string | null | undefined;
}

export function AuthButton({ isAuthenticated, userImage }: AuthButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<null | "signIn" | "signOut">(
    null,
  );

  const handleSignOut = async () => {
    setLoading("signOut");
    try {
      await signOut();
      router.push("/");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  };

  const handleSignIn = async () => {
    setLoading("signIn");
    try {
      await signIn("discord");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  };

  return isAuthenticated ? (
    <div className="hover:bg-gray-750 flex items-center gap-2 rounded-lg bg-gray-800 p-2 text-gray-300">
      {userImage && (
        <Image
          src={userImage}
          alt="User avatar"
          width={32}
          height={32}
          className="rounded-full"
        />
      )}
      <button
        onClick={handleSignOut}
        className="flex w-full items-center justify-center p-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        aria-busy={loading === "signOut"}
        disabled={!!loading}
      >
        {loading === "signOut" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d={siDiscord.path} />
        </svg>
        Sign out
      </button>
    </div>
  ) : (
    <button
      onClick={handleSignIn}
      className="hover:bg-gray-750 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 p-3 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
      aria-busy={loading === "signIn"}
      disabled={!!loading}
    >
      {loading === "signIn" ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : null}{" "}
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d={siDiscord.path} />
      </svg>{" "}
      Sign in
    </button>
  );
}
