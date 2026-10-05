const token = Deno.env.get('MP_' + 'ACCESS_TOKEN');
Deno.serve(() => new Response(token ? 'configured' : 'missing'));