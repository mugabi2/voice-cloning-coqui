---
name: vast_basic_connector
overview: Create a minimal, Windows-friendly way to reliably reach your Vast.ai GPU web service (Coqui FastAPI on port 5001) by standardizing port exposure, validating the mapping, and generating a local config + quick connectivity checks.
todos:
  - id: confirm_internal_port
    content: Confirm Coqui service internal port and bind address (should be 0.0.0.0:5001).
    status: pending
  - id: template_port_exposure
    content: Define Vast template Docker options to ensure port 5001 is opened (-p 5001:5001) and document how to find the mapped external port.
    status: pending
  - id: local_connector_script
    content: Add a minimal PowerShell script that takes PUBLIC_IP and mapped PUBLIC_PORT, verifies /health, and writes .env.local COQUI_URL for the Next app.
    status: pending
  - id: smoke_test_instructions
    content: "Add short runbook: how to test inside instance vs from laptop, and common failure messages."
    status: pending
isProject: false
---

## Goal
Make connecting to a Vast.ai rented GPU instance *boring and reliable* for a **web service** (not SSH): you rent in Vast UI, copy the instance’s **IP Port Info mapping**, then run one local command that:
- validates the service is reachable (`/health`)
- prints the correct URL to use
- optionally writes your local `.env.local` so your Next app targets the GPU

## What’s going wrong (most common Vast.ai causes)
- Vast maps *internal container ports* to **random external ports** on a shared public IP. You must use the **external mapped port**, not the internal one.
- Your service must listen on **0.0.0.0**, not `127.0.0.1`.
- You must ensure the port is actually opened for the instance (via Docker `EXPOSE` and/or `-p` options).

Your GPU service already does the right thing:
- The container exposes **5001** and runs Uvicorn on `0.0.0.0:5001`.

```14:17:D:\Phaneroo IT Dept\voice clonings\coqui\gpu-services\coqui\Dockerfile
EXPOSE 5001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5001"]
```

## Minimal workflow design (manual rent → connect)
### On Vast.ai (when creating the instance)
- Pick a template/launch mode that runs your container.
- Ensure **internal port 5001** is opened.
  - Vast will open ports declared via `EXPOSE` in your Docker image, but to be explicit and predictable, we’ll also set Docker options in the template:
    - `-p 5001:5001`
- After the instance boots, open **IP Port Info** and locate the mapping:
  - `PUBLIC_IP:PUBLIC_PORT -> 5001/tcp`

### On your local Windows machine (the “basic connector”)
Implement a tiny local helper (PowerShell-first; Docker optional) called `vast-connect.ps1` that:
- asks for or accepts:
  - `PUBLIC_IP`
  - `PUBLIC_PORT` (the one mapped to internal `5001/tcp`)
- constructs `COQUI_URL=http://PUBLIC_IP:PUBLIC_PORT`
- runs quick checks:
  - `GET http://PUBLIC_IP:PUBLIC_PORT/health`
  - prints the response (and warns if `gpu:false`)
- writes local config for your Next app:
  - create/update `[D:\Phaneroo IT Dept\voice clonings\coqui\.env.local](D:\Phaneroo IT Dept\voice clonings\coqui\.env.local)` with `COQUI_URL=...`

This aligns with your existing client config:

```13:19:D:\Phaneroo IT Dept\voice clonings\coqui\lib\coqui.ts
export function getCoquiConfig(): CoquiConfig {
  // ...
  return {
    baseUrl: normalizeBaseUrl(process.env.COQUI_URL ?? DEFAULT_BASE_URL),
    // ...
  };
}
```

## Test strategy (fast, deterministic)
- **Inside the Vast instance** (one-time sanity test):
  - `python -c "import requests; print('ok')"` (confirm Python env)
  - `curl -sS http://127.0.0.1:5001/health` (service is up internally)
- **From your laptop** (what the helper automates):
  - `Invoke-WebRequest http://PUBLIC_IP:PUBLIC_PORT/health`

## If `/health` works but your UI still fails
- Your browser/network may block mixed content if your local UI is `https` and GPU is `http`.
  - Fix by running local UI on `http://localhost` during dev, or later add a simple HTTPS reverse proxy (optional).

## If `/health` does NOT work from your laptop
The helper will print targeted next checks:
- verify you copied the *mapped* external port for `5001/tcp`
- verify the instance actually opened port 5001 (template docker options contain `-p 5001:5001`)
- verify the service is listening on `0.0.0.0:5001` (already true in your Dockerfile)

## Files we will add/change (once you approve execution)
- Add: `[D:\Phaneroo IT Dept\voice clonings\coqui\scripts\vast-connect.ps1](D:\Phaneroo IT Dept\voice clonings\coqui\scripts\vast-connect.ps1)`
- Add (optional): `[D:\Phaneroo IT Dept\voice clonings\coqui\scripts\vast-connect.md](D:\Phaneroo IT Dept\voice clonings\coqui\scripts\vast-connect.md)` quick instructions
- Update (optional): `[D:\Phaneroo IT Dept\voice clonings\coqui\gpu-services\coqui\Dockerfile](D:\Phaneroo IT Dept\voice clonings\coqui\gpu-services\coqui\Dockerfile)` only if we decide to standardize another port or add explicit startup logging

## Why this is “basic”
- No SSH required.
- No Vast tunnel required.
- You just need the IP Port Info line `… -> 5001/tcp` and you’re connected.
