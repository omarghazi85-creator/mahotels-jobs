<?php
/** Disposable WordPress fixture. No production post types are modified. */
function cpt_assert($condition, $label) { if (!$condition) { fwrite(STDERR, "FAIL: $label\n"); exit(1); } }
register_post_type('mah_scope_job', array(
    'public'=>true, 'show_in_rest'=>true, 'map_meta_cap'=>true,
    'supports'=>array('title','editor','custom-fields'),
    'capability_type'=>array('mah_scope_job','mah_scope_jobs'),
    'capabilities'=>array(
        'edit_post'=>'edit_mah_scope_job', 'read_post'=>'read_mah_scope_job', 'delete_post'=>'delete_mah_scope_job',
        'edit_posts'=>'mah_jobs_service', 'create_posts'=>'mah_jobs_service',
        'edit_others_posts'=>'edit_others_mah_scope_jobs', 'publish_posts'=>'publish_mah_scope_jobs',
        'read_private_posts'=>'read_private_mah_scope_jobs', 'delete_posts'=>'delete_mah_scope_jobs',
        'delete_others_posts'=>'delete_others_mah_scope_jobs', 'delete_published_posts'=>'delete_published_mah_scope_jobs',
        'delete_private_posts'=>'delete_private_mah_scope_jobs', 'edit_published_posts'=>'edit_published_mah_scope_jobs',
        'edit_private_posts'=>'edit_private_mah_scope_jobs',
    ),
));
register_taxonomy('mah_scope_country','mah_scope_job',array(
    'public'=>true, 'show_in_rest'=>true,
    'capabilities'=>array('manage_terms'=>'manage_mah_scope_terms','edit_terms'=>'edit_mah_scope_terms',
        'delete_terms'=>'delete_mah_scope_terms','assign_terms'=>'mah_jobs_service'),
));
register_post_meta('mah_scope_job','_mah_scope_source',array(
    'single'=>true, 'type'=>'string', 'show_in_rest'=>true,
    'auth_callback'=>function ($allowed,$key,$post_id) { return current_user_can('edit_post',$post_id); },
    'sanitize_callback'=>'sanitize_text_field',
));
// Additional fail-closed policy for the service, not for editors.
add_filter('rest_pre_insert_mah_scope_job', function ($prepared,$request) {
    if (!current_user_can('mah_jobs_service')) { return $prepared; }
    if (($request->get_param('status') ?? 'draft') !== 'draft') {
        return new WP_Error('service_draft_only','Only drafts are allowed.',array('status'=>403));
    }
    $id = (int)$request->get_param('id');
    if ($id && (get_post_status($id) !== 'draft' || (int)get_post_field('post_author',$id) !== get_current_user_id())) {
        return new WP_Error('service_draft_only','Owned drafts only.',array('status'=>403));
    }
    return $prepared;
},10,2);
$admin = get_user_by('login','fixture_admin');
wp_set_current_user($admin->ID);
$term = wp_insert_term('Test Country','mah_scope_country');
cpt_assert(!is_wp_error($term),'create test term');
$other = wp_insert_post(array('post_type'=>'mah_scope_job','post_status'=>'draft','post_title'=>'Other draft','post_author'=>$admin->ID));
$user_id=wp_create_user('fixture_custom_cpt','test-only-password','custom-cpt@example.test');
cpt_assert(!is_wp_error($user_id),'create disposable user');
$user=new WP_User($user_id); $user->set_role('mah_jobs_service');
wp_set_current_user($user_id);
cpt_assert(!current_user_can('edit_posts') && !current_user_can('publish_posts') && !current_user_can('edit_others_posts'),'no general post permissions');
$request=new WP_REST_Request('POST','/wp/v2/mah_scope_job');
$request->set_param('title','Scoped test draft'); $request->set_param('status','draft');
$request->set_param('mah_scope_country',array((int)$term['term_id']));
$request->set_param('meta',array('_mah_scope_source'=>'EXAMPLE-1'));
$created=rest_do_request($request);
cpt_assert($created->get_status()===201,'create draft with custom capability and term/meta');
$data=$created->get_data(); $id=$data['id'] ?? 0;
cpt_assert($id && get_post_status($id)==='draft' && (int)get_post_field('post_author',$id)===$user_id,'draft ownership');
cpt_assert(($data['meta']['_mah_scope_source']??'')==='EXAMPLE-1','metadata returned');
cpt_assert(in_array((int)$term['term_id'],array_map('intval',$data['mah_scope_country']??array()),true),'term returned');
$publish=new WP_REST_Request('POST','/wp/v2/mah_scope_job/'.$id); $publish->set_param('status','publish');
cpt_assert(rest_do_request($publish)->get_status()===403,'cannot publish own draft');
$edit=new WP_REST_Request('POST','/wp/v2/mah_scope_job/'.$other); $edit->set_param('title','Changed');
cpt_assert(rest_do_request($edit)->get_status()===403,'cannot edit another author draft');
$create_publish=new WP_REST_Request('POST','/wp/v2/mah_scope_job');
$create_publish->set_param('title','Publish attempt'); $create_publish->set_param('status','publish');
cpt_assert(rest_do_request($create_publish)->get_status()===403,'cannot create published post');
wp_set_current_user(0);
cpt_assert(rest_do_request($request)->get_status()===401,'anonymous rejected');
echo "Custom CPT capability fixture passed\n";
