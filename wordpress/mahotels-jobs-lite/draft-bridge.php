<?php
defined('ABSPATH') || exit;

/** Only authenticated editors can inspect or populate untouched generated drafts. */
add_action('rest_api_init', function () {
    register_rest_route('mahotels-jobs/v1', '/draft-fields/(?P<id>\d+)', array(
        'methods' => array('GET', 'POST'),
        'permission_callback' => function ($request) {
            $id = (int) $request['id'];
            return current_user_can('edit_posts') && current_user_can('edit_others_posts') &&
                current_user_can('edit_post', $id) && get_post_type($id) === 'ma_hotel_job' &&
                get_post_status($id) === 'draft';
        },
        'callback' => function ($request) {
            $id = (int) $request['id'];
            $slug = get_post_field('post_name', $id);
            if (!is_string($slug) || !preg_match('/^ma-jobs-[a-f0-9]{32}$/D', $slug)) {
                return new WP_Error('invalid_draft', 'Generated draft required.', array('status' => 409));
            }
            $keys = array('source_id','source_url','company','city','role','posted_on','expires_on','verified_on','ar_ready');
            if ($request->get_method() === 'GET') {
                $fields = array();
                foreach ($keys as $key) { $fields[$key] = get_post_meta($id, '_ma_job_' . $key, true); }
                return rest_ensure_response(array('id' => $id, 'status' => 'draft', 'fields' => $fields));
            }
            foreach ($keys as $key) {
                if (metadata_exists('post', $id, '_ma_job_' . $key)) {
                    return new WP_Error('draft_not_empty', 'Draft metadata already exists; review required.', array('status' => 409));
                }
            }
            $providers = array('accor'=>'AccorHotel','radisson'=>'RHG','marriott'=>'Marriott','rotana'=>'Rotana');
            $source = $request->get_param('source');
            $original_id = $request->get_param('original_id');
            $url = $request->get_param('source_url');
            if (!is_string($source) || !isset($providers[$source]) || !is_string($original_id) ||
                !preg_match('/^[A-Za-z0-9._-]{1,160}$/D', $original_id) ||
                !is_string($url) || strlen($url) > 2048 || preg_match('/[\x00-\x20\x7f]/', $url)) {
                return new WP_Error('invalid_source', 'Invalid source identity.', array('status' => 400));
            }
            $parts = wp_parse_url($url);
            $hosts = array('api.smartrecruiters.com', 'jobs.smartrecruiters.com', 'careers.marriott.com',
                'careers.rotana.com', 'apply.workable.com', 'rotana-hotels.workable.com', 'www.workable.com');
            if (!is_array($parts) || strtolower($parts['scheme'] ?? '') !== 'https' ||
                !in_array(strtolower($parts['host'] ?? ''), $hosts, true) || isset($parts['user']) || isset($parts['pass'])) {
                return new WP_Error('invalid_source_url', 'Invalid source URL.', array('status' => 400));
            }
            $data = array('source_id'=>$providers[$source] . ':' . $original_id, 'source_url'=>$url, 'ar_ready'=>'0');
            foreach (array('company','city','role') as $key) {
                $value = $request->get_param($key);
                if (!is_string($value) || trim($value) === '' || strlen($value) > 500) {
                    return new WP_Error('invalid_field', 'Missing or invalid job field.', array('status' => 400));
                }
                $value = sanitize_text_field($value);
                if ($value === '') { return new WP_Error('invalid_field', 'Missing or invalid job field.', array('status' => 400)); }
                $data[$key] = $value;
            }
            foreach (array('posted_on','expires_on') as $key) {
                $value = $request->get_param($key);
                if ($value === null || $value === '') { continue; }
                if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
                    return new WP_Error('invalid_date', 'Invalid date.', array('status' => 400));
                }
                $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
                if (!$date || $date->format('Y-m-d') !== $value) { return new WP_Error('invalid_date', 'Invalid date.', array('status' => 400)); }
                $data[$key] = $value;
            }
            // verified_on stays absent until the source is explicitly rechecked.
            foreach ($data as $key => $value) {
                if (get_post_status($id) !== 'draft') { return new WP_Error('draft_changed', 'Draft status changed; review required.', array('status' => 409)); }
                update_post_meta($id, '_ma_job_' . $key, $value);
                if (get_post_meta($id, '_ma_job_' . $key, true) !== $value) {
                    return new WP_Error('metadata_write_failed', 'Draft metadata incomplete; review required.', array('status' => 503));
                }
            }
            if (get_post_status($id) !== 'draft') { return new WP_Error('draft_changed', 'Draft status changed; review required.', array('status' => 409)); }
            return rest_ensure_response(array('id'=>$id, 'status'=>'draft', 'fields'=>$data));
        },
    ));
});
