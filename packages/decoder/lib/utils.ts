import { ContractObject } from "@truffle/contract-schema/spec";
import Codec from "@truffle/codec";

import * as Types from "./types";

//NOTE: Definitely do not use this in real code!  For tests only!
//for convenience: invokes the nativize method on all the given variables, and changes them to
//the old format
export function nativizeDecoderVariables(
  variables: Types.StateVariable[]
): { [name: string]: any } {
  return Object.assign(
    {},
    ...variables.map(({ name, value }) => ({
      [name]: Codec.Format.Utils.Inspect.nativize(value)
    }))
  );
  //note that the assignments are processed in order, so if multiple have same name, later
  //(i.e. more derived) will overwrite earlier (i.e. baser)... be aware!  I mean, this is the
  //right way to do overwriting, but it's still overwriting so still dangerous.
  //Again, don't use this in real code!
}

export function getContractNode(contract: ContractObject): Codec.Ast.AstNode {
  return (contract.ast || { nodes: [] }).nodes.find(
    (contractNode: Codec.Ast.AstNode) =>
      contractNode.nodeType === "ContractDefinition" &&
      (contractNode.name === contract.contractName ||
        contractNode.name === contract.contract_name)
  );
}

export function makeContext(
  contract: ContractObject,
  node: Codec.Ast.AstNode | undefined,
  isConstructor = false
): Codec.Contexts.Types.DecoderContext {
  const abi = Codec.Utils.Abi.schemaAbiToAbi(contract.abi);
  const binary = isConstructor ? contract.bytecode : contract.deployedBytecode;
  const hash = Codec.Utils.Conversion.toHexString(
    Codec.Evm.Utils.keccak256({
      type: "string",
      value: binary
    })
  );
  return {
    context: hash,
    contractName: contract.contractName,
    binary,
    contractId: node ? node.id : undefined,
    contractKind: contractKind(contract, node),
    isConstructor,
    abi: Codec.Utils.Abi.computeSelectors(abi),
    payable: Codec.Utils.Abi.abiHasPayableFallback(abi),
    hasFallback: Codec.Utils.Abi.abiHasFallback(abi),
    compiler: contract.compiler
  };
}

//attempts to determine if the given contract is a library or not
function contractKind(
  contract: ContractObject,
  node?: Codec.Ast.AstNode
): Codec.Common.Types.ContractKind {
  //first: if we have a node, use its listed contract kind
  if (node) {
    return node.contractKind;
  }
  //next: check the contract kind field on the contract object itself, if it exists.
  //however this isn't implemented yet so we'll skip it.
  //next: if we have no direct info on the contract kind, but we do
  //have the deployed bytecode, we'll use a HACK:
  //we'll assume it's an ordinary contract, UNLESS its deployed bytecode begins with
  //PUSH20 followed by 20 0s, in which case we'll assume it's a library
  //(note: this will fail to detect libraries from before Solidity 0.4.20)
  if (contract.deployedBytecode) {
    const pushAddressInstruction = (
      0x60 +
      Codec.Evm.Utils.ADDRESS_SIZE -
      1
    ).toString(16); //"73"
    const libraryString =
      "0x" + pushAddressInstruction + "00".repeat(Codec.Evm.Utils.ADDRESS_SIZE);
    return contract.deployedBytecode.startsWith(libraryString)
      ? "library"
      : "contract";
  }
  //finally, in the absence of anything to go on, we'll assume it's an ordinary contract
  return "contract";
}
