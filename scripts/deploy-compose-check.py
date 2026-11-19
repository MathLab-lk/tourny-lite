#!/usr/bin/env python3
"""Structural assertions for deploy/docker-compose.yml (two-slot layout).

Usage: python3 scripts/deploy-compose-check.py [path-to-compose]
Defaults to <repo>/deploy/docker-compose.yml. Exits non-zero on failure.
"""
import os
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(__file__), "..", "deploy", "docker-compose.yml")
with open(path) as fh:
    doc = yaml.safe_load(fh)

count = 0
errors = []


def want(cond, msg):
    global count
    count += 1
    if not cond:
        errors.append(msg)


want(doc.get("name") == "tourny-lite", f"compose project name: {doc.get('name')!r}")
svcs = doc.get("services", {})
want(set(svcs) == {"stable", "dev"}, f"services: {list(svcs)}")
st = svcs.get("stable", {})
dv = svcs.get("dev", {})

# ---- stable slot ------------------------------------------------------------
want(st.get("container_name") == "tourny-stable", "stable container_name")
want(st.get("image") == "tourny-lite:stable", "stable image")
want(st.get("ports") == ["127.0.0.1:8090:8090"], f"stable ports: {st.get('ports')}")
want(st.get("volumes") == ["./data-stable:/app/db"], "stable volume")
want(st.get("env_file") == ["./env/stable.env"], "stable env_file")
want(st.get("build", {}).get("context") == "./worktrees/stable", "stable build context")
want(st.get("build", {}).get("dockerfile") == "deploy/Dockerfile", "stable dockerfile")
want(st.get("restart") == "unless-stopped", "stable restart")
want(st.get("init") is True, "stable init")
envs = st.get("environment", {})
want(envs.get("TZ") == "Asia/Colombo" and envs.get("NODE_ENV") == "production",
     "stable env TZ/NODE_ENV from anchor")
want("SESSION_COOKIE_NAME" not in envs and "APP_VARIANT" not in envs,
     "stable must NOT carry dev-only env vars")
mem = st.get("deploy", {}).get("resources", {}).get("limits", {}).get("memory")
want(mem == "512M", f"stable memory limit: {mem!r}")
hc = st.get("healthcheck", {})
want(hc.get("test", [None])[-1] == "http://127.0.0.1:8090/api",
     f"stable healthcheck url: {hc.get('test')}")
want(hc.get("interval") == "30s" and hc.get("retries") == 3, "stable healthcheck timing")
lg = st.get("logging", {})
want(lg.get("driver") == "json-file" and lg.get("options", {}).get("max-size") == "10m",
     "stable logging")

# ---- dev slot ---------------------------------------------------------------
want(dv.get("container_name") == "tourny-dev", "dev container_name")
want(dv.get("image") == "tourny-lite:dev", "dev image")
want(dv.get("ports") == ["127.0.0.1:8091:8090"], f"dev ports: {dv.get('ports')}")
want(dv.get("volumes") == ["./data-dev:/app/db"], "dev volume")
want(dv.get("env_file") == ["./env/dev.env"], "dev env_file")
want(dv.get("build", {}).get("context") == "./worktrees/dev", "dev build context")
denv = dv.get("environment", {})
want(denv.get("TZ") == "Asia/Colombo" and denv.get("NODE_ENV") == "production",
     "dev env TZ/NODE_ENV repeated (local environment replaces anchor map)")
want(denv.get("SESSION_COOKIE_NAME") == "tourny_session_dev",
     f"dev SESSION_COOKIE_NAME: {denv.get('SESSION_COOKIE_NAME')!r}")
want(denv.get("APP_VARIANT") == "experimental", f"dev APP_VARIANT: {denv.get('APP_VARIANT')!r}")
mem = dv.get("deploy", {}).get("resources", {}).get("limits", {}).get("memory")
want(mem == "384M", f"dev memory limit: {mem!r}")
want(dv.get("restart") == "unless-stopped" and dv.get("init") is True, "dev restart/init")
want(dv.get("healthcheck", {}).get("test", [None])[-1] == "http://127.0.0.1:8090/api",
     "dev healthcheck (internal port 8090)")

if errors:
    print("COMPOSE CHECK FAILURES:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print(f"COMPOSE CHECK OK — {count} assertions passed")
