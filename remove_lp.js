const {
    Liquidity,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    Token,
    Percent,
    TokenAmount,
    TOKEN_PROGRAM_ID
  } = require('@raydium-io/raydium-sdk');
  const {  getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');

  const BN = require('bn.js');
  const { PublicKey } = require('@metaplex-foundation/js');
  const {
    Keypair,
    VersionedTransaction,
    Transaction,
    sendTransaction,
    LAMPORTS_PER_SOL,
    TransactionInstruction, SystemProgram , ComputeBudgetProgram} = require('@solana/web3.js')

  const bs58 = require('bs58')
  const {
    connection,
    makeTxVersion, getWalletTokenAccount, CONFIG_PROGRAM_ID, buildAndSendTx, sleepTime
} = require('../../config.js')


const {
  RPC_URL,
  fundWalletPK,
  poolKeys,
  swapConfig,
  targetPoolInfo,
  sellpercent, minR, maxR,
  AIRDOP_AMT,
  scheduleJob,
  noOfWallets, randomAmountsBuy, fund_wallet_maker,
  MINT_ADDRESS, MAIN_WALLET_ADDR, MAIN_WALLET_PKK,SEND_AMT,
  ADDLP_BASE_AMT, ADDLP_QUOTE_AMT, 
  BUY_BACK_PK1, BUY_BACK_AMT1,
  BUY_BACK_PK2, BUY_BACK_AMT2,
  BUY_BACK_PK3, BUY_BACK_AMT3,
  BUY_BACK_PK4, BUY_BACK_AMT4
  } = require("../../CONSTANTS.js")

const myKeyPair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(fundWalletPK)));
const myPublicKey = myKeyPair.publicKey

async function removeLiquidity() {
    let senderTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    myKeyPair,
    new PublicKey(targetPoolInfo.lpMint),
    myKeyPair.publicKey
    )
    const senderTokenBalance = Number(senderTokenAccount.amount);
    const lpToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(targetPoolInfo.lpMint),targetPoolInfo.lpDecimals)
    const removeLpTokenAmount = new TokenAmount(lpToken, senderTokenBalance)

let walletTokenAccounts;
let found = false;
while (!found) {
    walletTokenAccounts = await getWalletTokenAccount(connection, myKeyPair.publicKey)
    walletTokenAccounts.forEach((tokenAccount) => {
        if (tokenAccount.accountInfo.mint.toString() == targetPoolInfo.lpMint) {
            console.log("tokenAccount: ", tokenAccount.accountInfo.mint.toString())
            console.log("mintAddress: ", targetPoolInfo.baseMint)
            console.log("FOUND tokenAccount", tokenAccount.accountInfo.mint.toString())
            found = true;
            return;
        }
    });

    if (!found) {
        console.log("checking new token in wallet...")
        await sleepTime(1000); // Wait for 1 seconds before retrying
    }
}

  const removeLiquidityInstructionResponse = await Liquidity.makeRemoveLiquidityInstructionSimple({
    connection,
    poolKeys,
    userKeys: {
      owner: myPublicKey,
      payer: myPublicKey,
      tokenAccounts: walletTokenAccounts,
    },
    amountIn: removeLpTokenAmount,
    makeTxVersion,
  })


  const tx = new Transaction()
  const hash_info = (await connection.getLatestBlockhashAndContext()).value;
  tx.recentBlockhash = hash_info.blockhash
  tx.lastValidBlockHeight = hash_info.lastValidBlockHeight
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 10000,
    });

    tx.add(addPriorityFee);

  tx.feePayer = myKeyPair.publicKey
 
  removeLiquidityInstructionResponse.innerTransactions[0].instructions.forEach(e=>{
    tx.add(e);
  })
  
  tx.sign(myKeyPair)
 
  const rawTransaction = tx.serialize();

  return connection.sendRawTransaction(rawTransaction,
    {
      skipPreflight: true,
    });

}

removeLiquidity()
