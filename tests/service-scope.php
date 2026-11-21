<?php
/** CI-only, disposable WordPress database. */
function scope_assert($ok, $message) { if (!$ok) { fwrite(STDERR, "FAIL: $message\n"); exit(1); } }
$admin = get_user_by('login', 'fixture_admin');
wp_set_current_user($admin->ID);
$term = wp_insert_term('Scope country', 'ma_job_country', array('slug'=>'scope-test'));
scope_assert(!is_wp_error($term), 'fixture country');
$other = wp_insert_post(array('post_type'=>'ma_hotel_job','post_status'=>'draft','post_title'=>'Another editor draft'));
require_once ABSPATH . 'wp-admin/includes/user.php';
$role = get_role('mah_jobs_service');
scope_assert($role && $role->name === 'mah_jobs_service', 'service role exists');
$caps = $role->capabilities; ksort($caps);
scope_assert($caps === array('mah_jobs_service'=>true, 'read'=>true), 'role has exactly two capabilities');
$roles = get_editable_roles();
scope_assert(isset($roles['mah_jobs_service']) && $roles['mah_jobs_service']['name'] === 'MAHotels Jobs Service', 'role visible to administrator');
scope_assert(count(get_users(array('role'=>'mah_jobs_service', 'fields'=>'ID'))) === 0, 'no user assigned automatically');
$uid = wp_create_user('fixture_service', 'test-only-password', 'scope@example.test');
scope_assert(!is_wp_error($uid), 'fixture user');
$user = new WP_User($uid);
$user->set_role('mah_jobs_service');
wp_set_current_user($uid);
scope_assert(!current_user_can('edit_posts') && !current_user_can('edit_others_posts') && !current_user_can('publish_posts'), 'no broad editor caps');
$create = function ($params) {
    $request = new WP_REST_Request('POST', '/mahotels-jobs/v1/service-drafts');
    $request->set_header('Content-Type', 'application/json');
    $request->set_body(wp_json_encode($params));
    return rest_do_request($request);
};
$payload = array('title'=>'Fixture job','content'=>'<p>Fixture description</p>', 'slug'=>'ma-jobs-'.str_repeat('f',32), 'country_id'=>(int)$term['term_id']);
$publish = $payload; $publish['status'] = 'publish';
scope_assert($create($publish)->get_status() === 400, 'publish field rejected');
$forged = $payload; $forged['author'] = $admin->ID;
scope_assert($create($forged)->get_status() === 400, 'author field rejected');
$result = $create($payload);
scope_assert($result->get_status() === 201, 'service creates draft');
$id = $result->get_data()['id'];
scope_assert(get_post_status($id) === 'draft' && (int)get_post_field('post_author',$id) === $uid, 'draft author and status');
$read = new WP_REST_Request('GET', '/mahotels-jobs/v1/service-drafts/'.$id);
$read_response = rest_do_request($read);
scope_assert($read_response->get_status() === 200 && $read_response->get_data()['title'] === 'Fixture job' && $read_response->get_data()['country_ids'] === array((int)$term['term_id']), 'read owned draft');
$read_other = new WP_REST_Request('GET', '/mahotels-jobs/v1/service-drafts/'.$other);
scope_assert(rest_do_request($read_other)->get_status() === 403, 'cannot read other draft');
$slug_lookup = new WP_REST_Request('POST', '/mahotels-jobs/v1/service-drafts/slug-exists');
$slug_lookup->set_param('slug', $payload['slug']);
scope_assert(rest_do_request($slug_lookup)->get_data() === array('exists'=>true), 'slug lookup finds draft');
wp_trash_post($id);
scope_assert(rest_do_request($slug_lookup)->get_data() === array('exists'=>true), 'slug lookup finds trash');
wp_untrash_post($id);
// The WordPress.com content-items tool uses this core-style REST controller.
// A scoped service role has no core create capability.
$core_create = new WP_REST_Request('POST', '/wp/v2/ma_hotel_job');
$core_create->set_param('title', 'Core REST draft');
$core_create->set_param('status', 'draft');
scope_assert(rest_do_request($core_create)->get_status() === 403, 'scoped service cannot create through core REST');
$core = new WP_REST_Request('POST', '/wp/v2/ma_hotel_job/'.$id);
$core->set_param('status','publish');
scope_assert(rest_do_request($core)->get_status() === 403, 'core publish denied');
$core_other = new WP_REST_Request('POST', '/wp/v2/ma_hotel_job/'.$other);
$core_other->set_param('title','modified');
scope_assert(rest_do_request($core_other)->get_status() === 403, 'core edit another job denied');
$fields = new WP_REST_Request('POST', '/mahotels-jobs/v1/draft-fields/'.$other);
scope_assert(rest_do_request($fields)->get_status() === 403, 'bridge edit another job denied');
$fields = new WP_REST_Request('POST', '/mahotels-jobs/v1/draft-fields/'.$id);
foreach (array('source'=>'marriott','original_id'=>'SCOPE-1','source_url'=>'https://careers.marriott.com/job/SCOPE-1?a=b','company'=>'Fixture','city'=>'Riyadh','role'=>'Fixture') as $k=>$v) { $fields->set_param($k,$v); }
scope_assert(rest_do_request($fields)->get_status() === 200, 'bridge populates owned draft');
$lookup = new WP_REST_Request('POST', '/mahotels-jobs/v1/source-exists');
foreach (array('source'=>'marriott','original_id'=>'SCOPE-1','source_url'=>'https://careers.marriott.com/job/SCOPE-1?a=b') as $k=>$v) { $lookup->set_param($k,$v); }
$found = rest_do_request($lookup);
scope_assert($found->get_status() === 200 && $found->get_data() === array('exists'=>true), 'duplicate check');
wp_set_current_user(0);
scope_assert($create($payload)->get_status() === 401, 'anonymous denied');
scope_assert(rest_do_request($read)->get_status() === 401, 'anonymous cannot read');
scope_assert(rest_do_request($slug_lookup)->get_status() === 401, 'anonymous cannot query slug');
echo "Scoped service checks passed\n";
