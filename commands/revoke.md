# `hush revoke`

!!!
Not illustrated in a gif to not expose secret information.
!!!

To prevent another IAM user **in the same AWS account** from accessing your secret, use the `revoke` command like this:

`yarn hush revoke joern-prod <user-identifier>`

**`user-identifier` has to be _either_ an AWS ARN _or_ a username for a user that shares an AWS account with you.**

Please keep in mind that users with higher privileges than you might still be able to access the secrets.
