let
  publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILbIEuBf2A6nJJZeCDEyoT4JErJXIpGWFfzK+oTqfmbJ";
in
{
  "env.age".publicKeys = [ publicKey ];
}
