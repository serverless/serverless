// Registry entry for the `iam` AWS service.

const iamRoleEntry = {
  cfnType: 'AWS::IAM::Role',
  awsService: 'iam',
  category: 'iam',
  engineClient: 'iam',
  // PhysicalResourceId is the role name as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'role', method: 'GetRole', input: 'RoleName' },
    {
      key: 'inlinePolicies',
      method: 'ListRolePolicies',
      input: 'RoleName',
      paginate: true,
      // Each returned policy name needs its own GetRolePolicy call to fetch
      // the (URL-encoded) document -- a list->get fan-out.
      fanOut: {
        method: 'GetRolePolicy',
        // Field on the ListRolePolicies response holding the names to fan
        // out over.
        listResultKey: 'PolicyNames',
        // Name of the fan-out input param carrying each item; RoleName is
        // reused from the outer identifier automatically by the runner.
        itemInput: 'PolicyName',
      },
    },
    {
      key: 'attachedPolicies',
      method: 'ListAttachedRolePolicies',
      input: 'RoleName',
      paginate: true,
      // Each attached policy is a two-hop chain to its document:
      //   ListAttachedRolePolicies -> AttachedPolicies[].PolicyArn
      //     -> GetPolicy{PolicyArn} -> Policy.DefaultVersionId
      //       -> GetPolicyVersion{PolicyArn, VersionId} -> PolicyVersion.Document
      //
      // `fanOut` shape (declarative data only -- no SDK/HTTP execution here;
      // the run-calls.js runner interprets this):
      //   {
      //     method:        SDK method to call once per item from listResultKey.
      //     listResultKey: field on the list response holding the items to
      //                    fan out over.
      //     itemInput:     name of this call's input param fed from the
      //                    current item (via itemField, or the item itself
      //                    when itemField is omitted).
      //     itemField:     field on the item to read into itemInput.
      //     then:          optional chained follow-up call, run once per
      //                    fan-out result using the same item plus fields
      //                    pulled from that result:
      //       {
      //         method:     SDK method for the chained call.
      //         itemInput:  input param on the chained call fed from the
      //                     SAME item that fed the parent fan-out (e.g.
      //                     PolicyArn is reused unchanged).
      //         fromResult: { input, resultField } -- an additional input
      //                     param on the chained call, sourced from the
      //                     parent fan-out's own result via a dotted path
      //                     (e.g. VersionId <- Policy.DefaultVersionId).
      //       }
      //   }
      fanOut: {
        method: 'GetPolicy',
        listResultKey: 'AttachedPolicies',
        itemInput: 'PolicyArn',
        itemField: 'PolicyArn',
        then: {
          method: 'GetPolicyVersion',
          itemInput: 'PolicyArn',
          fromResult: {
            input: 'VersionId',
            resultField: 'Policy.DefaultVersionId',
          },
        },
      },
    },
  ],
}

export const iamRegistryEntries = [iamRoleEntry]
