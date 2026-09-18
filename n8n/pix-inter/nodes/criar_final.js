const rc = $('Criar: Resposta ao checkout').first().json || {};
return [{ json: rc.gravar ? rc.resposta : { via_inter: false, motivo: rc.motivo || 'falha ao gravar cobranca' } }];
