-- Fiabiliser la synchro à deux : les rappels suivent le téléphone, et la limite du code Echo marche comme prévu.

-- 1. Après une reconnexion au foyer, le téléphone a un nouveau compte. Son abonnement aux notifications (même adresse,
-- mêmes clés) restait au nom de l'ancien compte, et la règle « mes abonnements » lui interdisait de le reprendre.
-- Le téléphone prouve que l'abonnement est le sien en donnant ses deux clés, que lui seul et le serveur connaissent.
create or replace function public.reprendre_abonnement(p_endpoint text, p_p256dh text, p_auth text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  update public.abonnements set user_id = auth.uid(), maj = now()
    where endpoint = p_endpoint and p256dh = p_p256dh and auth = p_auth and user_id <> auth.uid();
  return found;
end $$;
revoke all on function public.reprendre_abonnement(text, text, text) from public, anon;
grant execute on function public.reprendre_abonnement(text, text, text) to authenticated;

-- 2. La limite d'appels. Avant : le code Echo était compté deux fois (comme une « personne » et « en tout »), donc arrêté
-- à la limite par personne, et la limite « en tout » n'était jamais atteinte. Si elle l'avait été, elle aurait aussi bloqué
-- les membres du foyer. Maintenant : un membre a sa limite par personne ; le code a la limite « en tout », et rien d'autre.
create or replace function public.noter_appel(p_qui text, p_quoi text, p_max_personne int, p_max_tous int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare lim int := case when p_qui = 'code' and p_max_tous > 0 then p_max_tous else p_max_personne end;
begin
  -- Un appel à la fois par fonction : des appels lancés ensemble ne passent pas tous sous la limite.
  perform pg_advisory_xact_lock(hashtext('echo-appels:' || p_quoi));
  if (select count(*) from prive.appels a where a.quoi = p_quoi and a.qui = p_qui and a.quand > now() - interval '1 hour') >= lim then
    return false;
  end if;
  insert into prive.appels (qui, quoi) values (p_qui, p_quoi);
  delete from prive.appels where quand < now() - interval '1 day';
  return true;
end $$;
revoke all on function public.noter_appel(text, text, int, int) from public, anon, authenticated;
grant execute on function public.noter_appel(text, text, int, int) to service_role;
