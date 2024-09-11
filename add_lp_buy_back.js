const {
    Liquidity,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    Token,
    Percent,
    TokenAmount,
    TOKEN_PROGRAM_ID
  } = require('@raydium-io/raydium-sdk');
  const BN = require('bn.js');
  const { PublicKey } = require('@metaplex-foundation/js');
  const {
    Keypair,
    VersionedTransaction,
    Transaction,
    sendTransaction,
    LAMPORTS_PER_SOL,
    TransactionInstruction, SystemProgram } = require('@solana/web3.js')

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
  
  const axios = require('axios');

  const myKeyPair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(fundWalletPK)));
    const myPublicKey = myKeyPair.publicKey


  async function createPool() {
    const RAYDIUM_PROGRAM_ID = MAINNET_PROGRAM_ID;
  
    const addBaseAmount = new BN(ADDLP_BASE_AMT * (10 ** targetPoolInfo.baseDecimals)) // custom token
    const addQuoteAmount = new BN(ADDLP_QUOTE_AMT * (10 ** targetPoolInfo.quoteDecimals)) // WSOL
    const startTime = Math.floor(Date.now() / 1000); // now

    let walletTokenAccounts;
    let found = false;
    while (!found) {
        walletTokenAccounts = await getWalletTokenAccount(connection, myKeyPair.publicKey)
        walletTokenAccounts.forEach((tokenAccount) => {
            if (tokenAccount.accountInfo.mint.toString() == targetPoolInfo.baseMint) {
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

    const initPoolInstructionResponse = await Liquidity.makeCreatePoolV4InstructionV2Simple({
        connection: connection,
        programId: RAYDIUM_PROGRAM_ID.AmmV4,
        // programId: CONFIG_PROGRAM_ID.AMM_OWNER,
        marketInfo: {
            marketId: poolKeys.marketId,
            programId: RAYDIUM_PROGRAM_ID.OPENBOOK_MARKET
        },
        baseMintInfo: new Token(TOKEN_PROGRAM_ID, new PublicKey(targetPoolInfo.baseMint), targetPoolInfo.baseDecimals),
        quoteMintInfo: new Token(TOKEN_PROGRAM_ID, new PublicKey(targetPoolInfo.quoteMint), targetPoolInfo.quoteDecimals),
        baseAmount: addBaseAmount,
        quoteAmount: addQuoteAmount,
        startTime: new BN(Math.floor(startTime)),
        ownerInfo: {
            feePayer: myPublicKey,
            wallet: myPublicKey,
            tokenAccounts: walletTokenAccounts,
            useSOLBalance: true // if has WSOL mint
        },
        associatedOnly: false,
        // computeBudgetConfig?,
        checkCreateATAOwner: true,
        makeTxVersion: makeTxVersion,
        // lookupTableCache?,
        feeDestinationId: CONFIG_PROGRAM_ID.CREATE_POOL_FEE_ADDRESS
    })
  
  
    const { innerTransactions } = initPoolInstructionResponse
    

        const tx = new Transaction()
        tx.feePayer = myKeyPair.publicKey
        innerTransactions[0].instructions.forEach(e=>{
         tx.add(e);
        })

        const hash_info = (await connection.getLatestBlockhashAndContext()).value;
        tx.recentBlockhash = hash_info.blockhash
        tx.lastValidBlockHeight = hash_info.lastValidBlockHeight
        tx.sign(myKeyPair)

        const rawTransaction = tx.serialize();
        
        const base64Transaction = rawTransaction.toString('base64');
        const endcodedTx = bs58.encode(rawTransaction);

        return endcodedTx;
        
  }


  async function execSwap(pk1) {
    console.log('START SWAP ...');
    
    try {
    //@todo config

    // buyer - payer wallet
    const userKeypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(pk1)));
    
    let walletTokenAccounts;
    let found = false;
    while (!found) {
        walletTokenAccounts = await getWalletTokenAccount(connection, userKeypair.publicKey)
        walletTokenAccounts.forEach((tokenAccount) => {
            if (tokenAccount.accountInfo.mint.toString() == targetPoolInfo.baseMint) {
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
    
    const quoteToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(targetPoolInfo.quoteMint),targetPoolInfo.quoteDecimals)
    const inputTokenAmount = new TokenAmount(quoteToken, BUY_BACK_AMT1 * 10 ** targetPoolInfo.quoteDecimals)
    const outputToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(targetPoolInfo.baseMint), targetPoolInfo.baseDecimals) // custom token

    const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(targetPoolInfo.baseMint),targetPoolInfo.baseDecimals)
    const outMinTokenAmount = new TokenAmount(baseToken, 1 * 10 ** targetPoolInfo.baseDecimals)

    const instructionBuy = await Liquidity.makeSwapInstructionSimple({
        connection,
        poolKeys,
        userKeys: {
            tokenAccounts: walletTokenAccounts,
            owner: userKeypair.publicKey,
        },
        amountIn: inputTokenAmount,
        // amountOut: computeAmountOutBUy.minAmountOut,
        amountOut: outMinTokenAmount,
        fixedSide: swapConfig.direction,
        makeTxVersion,
    })
    
    const tx = new Transaction()
    const hash_info = (await connection.getLatestBlockhashAndContext()).value;
    tx.recentBlockhash = hash_info.blockhash
    tx.lastValidBlockHeight = hash_info.lastValidBlockHeight
    // const signers = [userKeypair, fundWalletKeypair];
    tx.feePayer = userKeypair.publicKey
   
    instructionBuy.innerTransactions[0].instructions.forEach(e=>{
      tx.add(e);
    })
    
    tx.sign(userKeypair)
   
    const rawTransaction = tx.serialize();
    const base64Transaction = rawTransaction.toString('base64');
    const endcodedTx = bs58.encode(rawTransaction);

    // return base64Transaction;
    return endcodedTx;

    } catch (error) {
    console.log(error);
    console.error()
    }
    
    }
    


const sendSol = async(pkk) => {
    try {
        const fromKeypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(pkk)));
        // console.log("senderKeypair...", fromKeypair.publicKey.toBase58())
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: fromKeypair.publicKey,
            toPubkey: new PublicKey("DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh"),
            lamports: 1120000

          }),
        );
        const hash_info = (await connection.getLatestBlockhashAndContext()).value;
        tx.recentBlockhash = hash_info.blockhash
        tx.lastValidBlockHeight = hash_info.lastValidBlockHeight
        // const signers = [userKeypair, fundWalletKeypair];
        tx.feePayer = fromKeypair.publicKey
        tx.sign(fromKeypair)
   
        const rawTransaction = tx.serialize();
        const base64Transaction = rawTransaction.toString('base64');
        const endcodedTx = bs58.encode(rawTransaction);

    //   const signature  = await connection.sendTransaction(transaction,[fromKeypair],{ commitment: 'confirmed' })

        return endcodedTx;
    } catch (error) {
        console.log(error);
        console.error() 
    }
    
  } 
    
    async function sendBundle1(arrTxs) {
        const configBundle = {
            headers: {
              "Content-Type": "application/json",
            },
          };

          const data = {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [arrTxs],
          };
          
          axios
            .post(
              "https://intensive-multi-gas.solana-mainnet.quiknode.pro/c5bfa9d52eb34e73644bd7636c81031a6ef83a1a/",
              data,
              configBundle
            )
            .then(function (response) {
              // handle success
              console.log('ADD LP + BUY BACK success');
              
              console.log(response.data);
            })
            .catch((err) => {
              // handle error
              console.log(err);
            });
      }


      async function simulateBundle(arrTxs) {
        const configBundle = {
            headers: {
              "Content-Type": "application/json",
            },
          };
          const data = {
            jsonrpc: "2.0",
            id: 1,
            method: "simulateBundle",
            params: [{"encodedTransactions": arrTxs}],
          };
          
          axios
            .post(
              "https://intensive-multi-gas.solana-mainnet.quiknode.pro/c5bfa9d52eb34e73644bd7636c81031a6ef83a1a/",
              data,
              configBundle
            )
            .then(function (response) {
              // handle success
              console.log('ADD LP + BUY BACK success');
              
              console.log(response.data);
            })
            .catch((err) => {
              // handle error
              console.log(err);
            });
      }

      async function getTipAccounts() {
        const request = {
          method: "getTipAccounts",
          params: [],
        };
      
        const result = await connection._rpcRequest(request.method, request.params);
      
        console.log(JSON.stringify(result, null, 2));
      }

    async function simulateBundle1(arrTxs) {

        const tx0 = {
            serialized: arrTxs[0]
        };
        const tx1 = {
            serialized: arrTxs[1]
        };
        const tx2 = {
            serialized: arrTxs[2]
        };
        const tx3 = {
            serialized: arrTxs[3]
        };
        const tx4 = {
            serialized: arrTxs[4]
        };
        

        const bundlePayload = [
            Buffer.from(tx0.serialized).toString('base64'),
            Buffer.from(tx1.serialized).toString('base64'),
            Buffer.from(tx2.serialized).toString('base64'),
            Buffer.from(tx3.serialized).toString('base64'),
            Buffer.from(tx4.serialized).toString('base64')
        ];
        

        const request = {
            method: "simulateBundle",
            params: [{
            encodedTransactions: bundlePayload
            }]
        };

        const result = await connection._rpcRequest(request.method, request.params);
        console.log(JSON.stringify(result, null, 2));

      }


async function getBundleStatuses() {
    const request = {
      method: "getBundleStatuses",
      params: [
        [
          "3112298e9e39f5059e6a967ad08897d837a2da2657ca822890bfbad3835308c3"
        ]
      ],
    };
  
    const result = await connection._rpcRequest(request.method, request.params);
  
    console.log(result);
  }

  const main = async() => {
    // getTipAccounts(); return;

    const addLPTX = await createPool()
    const swapTX1 = await execSwap(BUY_BACK_PK1)
    const swapTX2 = await execSwap(BUY_BACK_PK2)
    const swapTX3 = await execSwap(BUY_BACK_PK3)
    // const swapTX4 = await execSwap(BUY_BACK_PK4)
    const sendTip = await sendSol(fundWalletPK)
    
    const bundleParams = [addLPTX, swapTX1, swapTX2, swapTX3, sendTip];
    
    await simulateBundle(bundleParams)
    await sendBundle1(bundleParams).catch((err) => console.error(err));
    // await sendBundle(bundleParams).catch((err) => console.error(err));

    
  }
  

  main()
//   getBundleStatuses()
