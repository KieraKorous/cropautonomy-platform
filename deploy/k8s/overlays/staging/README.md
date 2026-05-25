# Staging overlay (placeholder)

Staging environment is not standing up yet — see
[`docs/architecture/deployment-strategy.md`](../../../../docs/architecture/deployment-strategy.md).

When staging is needed, copy `../prod/kustomization.yaml` here and:

1. Set `namespace: cropautonomy-staging` (and add `namespace.yaml` in base
   with the same name to base if it doesn't exist for the chosen layout, or
   override here with a namespace patch).
2. Add Ingress patches for `app-staging.cropautonomy.com`,
   `field-staging.cropautonomy.com`, `api-staging.cropautonomy.com` and a
   matching TLS secret name suffix.
3. Add the same three Cloudflare A records (orange-cloud) pointing at the
   same ingress LB IP. Extend the cert-manager Cloudflare API token's zone
   scope if it needs new domains — for staging subdomains on the existing
   cropautonomy.com zone, no change is needed.
4. Add a separate `cropautonomy-env-staging` Secret materialization step in
   the deploy workflow keyed off `inputs.environment`.

No resources here yet so this folder is intentionally inert and not added to
any deploy workflow trigger.
