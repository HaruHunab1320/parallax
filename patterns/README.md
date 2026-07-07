# Patterns

Parallax has two kinds of patterns:

- **Custom-logic patterns** are TypeScript modules deployed with the control
  plane — see [`packages/patterns`](../packages/patterns) for the contract
  and the built-in library (consensus, cascades, routing, voting, and more).
  They are registered in that package's manifest, not uploaded at runtime.

- **Org-chart patterns** are the YAML files in this directory. They declare
  an agent team topology (roles, hierarchy, workflow steps) and execute via
  the workflow executor with managed CLI-agent threads. Roles can carry a
  confidence policy applied to every step result that reports a confidence
  signal:

  ```yaml
  roles:
    engineer:
      reportsTo: architect
      confidence:
        accept: 0.8          # done
        retryBelow: 0.6      # one retry with critique; best attempt wins
        escalateBelow: 0.4   # supervisor (reportsTo) reviews and decides
  ```

  Examples:

  - `org-pair-programming.yaml` — driver/navigator pair
  - `org-threaded-code-review.yaml` — author + reviewers over threads
  - `org-startup-team.yaml` — founder/engineers/reviewer hierarchy
  - `org-enterprise-review.yaml` — multi-stage enterprise review

The control plane loads YAML patterns from this directory
(`PARALLAX_PATTERNS_DIR`, default `./patterns`) and module patterns from
`@parallaxai/patterns`.
