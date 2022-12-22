# Deploying SW.js to Cloudflare workers

Deploying to cloudflare workers is the easier option to get up and running for free, you can do it by following the below

1. Log into Cloudflare Dashboard
2. Create KV Namespace
    * Under Workers > KV (left sidebar)
    * Click "Create Namespace"
    * Call it whatever you want, for this tutorial I'll be calling it KV
    * Click "Add"
3. Create Cloudflare Worker
    *  Under Workers > Overview (left sidebar)
    *  Click "Create a Service"
    *  Change nothing, press "Create a Service"
    *  Go to Settings
    *  Under settings, go to variables
    *  Under KV Namespace Bindings, Click "Add binding"
    *  Variable Name: BARE, KV Namespace: KV (or whatever you called it)
    *  Click "Save and Deploy"
    *  Click "Quick Edit" on the top of the page
        * If if freezes up while loading, just refresh and click quick edit again
    * Paste your SW.js code in
    * Click Save and Deploy 
