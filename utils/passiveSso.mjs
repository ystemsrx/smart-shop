export function getPassiveSsoFrameResult(rawUrl, shopOrigin) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_err) {
    return null;
  }

  if (url.origin !== shopOrigin) return null;

  if (url.pathname === "/login") {
    const checkFinished =
      url.searchParams.get("sso_checked") === "1" ||
      url.searchParams.get("oidc_error") === "1";
    return checkFinished ? { status: "anonymous" } : null;
  }

  return {
    status: "authenticated",
    redirect: `${url.pathname}${url.search}${url.hash}`,
  };
}
