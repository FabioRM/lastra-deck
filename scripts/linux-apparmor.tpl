abi <abi/4.0>,
include <tunables/global>

profile "${executable}" "/opt/${sanitizedProductName}/lastra-electron" flags=(unconfined) {
  userns,
  include if exists <local/${executable}>
}
